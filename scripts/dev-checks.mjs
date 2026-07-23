import {spawn} from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const checksPluginName = 'tweb-dev-checks';
const clearEventName = 'tweb:dev-checks:clear';
const readyEventName = 'tweb:dev-checks:ready';
const virtualClientId = 'virtual:tweb-dev-checks-client';
const resolvedVirtualClientId = `\0${virtualClientId}`;
const virtualClientPath = `/@id/__x00__${virtualClientId}`;
const maxOverlayOutputLength = 50_000;
const colors = {
  lint: '\u001B[33m',
  typecheck: '\u001B[35m'
};
const resetColor = '\u001B[0m';
const sourceFilePattern = /\.[cm]?[jt]sx?$/;
const ansiEscapePattern = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const virtualClientSource = `
let ownsOverlay = false;

if(import.meta.hot) {
  import.meta.hot.on('vite:error', (payload) => {
    ownsOverlay = payload.err?.plugin === '${checksPluginName}';
  });

  import.meta.hot.on('${clearEventName}', () => {
    if(!ownsOverlay) {
      return;
    }

    document.querySelectorAll('vite-error-overlay').forEach((overlay) => {
      if(typeof overlay.close === 'function') {
        overlay.close();
      } else {
        overlay.remove();
      }
    });
    ownsOverlay = false;
  });

  import.meta.hot.send('${readyEventName}');
}
`;

function getPrefix(label, stream) {
  return stream.isTTY ? `${colors[label]}[${label}]${resetColor} ` : `[${label}] `;
}

function pipeWithPrefix(input, output, label, onLine) {
  let buffered = '';

  function writeLine(line) {
    onLine?.(line.replace(ansiEscapePattern, ''));
    output.write(`${getPrefix(label, output)}${line}\n`);
  }

  input.setEncoding('utf8');
  input.on('data', (chunk) => {
    const lines = (buffered + chunk).split(/\r?\n/);
    buffered = lines.pop();

    for(const line of lines) {
      writeLine(line);
    }
  });
  input.on('end', () => {
    if(buffered) {
      writeLine(buffered);
    }
  });
}

function log(label, message, output = process.stdout) {
  output.write(`${getPrefix(label, output)}${message}\n`);
}

function getBinaryPath(rootDir, name) {
  const filename = process.platform === 'win32' ? `${name}.cmd` : name;
  return path.join(rootDir, 'node_modules', '.bin', filename);
}

function truncateOverlayOutput(output) {
  if(output.length <= maxOverlayOutputLength) {
    return output;
  }

  return `${output.slice(0, maxOverlayOutputLength)}\n\n` +
    'Output truncated. See the dev-server terminal for the complete report.';
}

export default function devChecks(rootDir) {
  return {
    name: checksPluginName,
    apply: 'serve',
    resolveId(id) {
      if(id === virtualClientId) {
        return resolvedVirtualClientId;
      }
    },
    load(id) {
      if(id === resolvedVirtualClientId) {
        return virtualClientSource;
      }
    },
    transformIndexHtml() {
      return [{
        tag: 'script',
        attrs: {
          type: 'module',
          src: virtualClientPath
        },
        injectTo: 'head'
      }];
    },
    configureServer(server) {
      const sourceDir = path.join(rootDir, 'src');
      const children = new Set();
      const diagnostics = {
        lint: undefined,
        typecheck: undefined
      };
      let disposed = false;
      let currentOverlayPayload;
      let lint;
      let lintPending = false;
      let lintTimer;

      function run(name, args, label, onLine) {
        const child = spawn(getBinaryPath(rootDir, name), args, {
          cwd: rootDir,
          env: process.env,
          shell: process.platform === 'win32',
          stdio: ['ignore', 'pipe', 'pipe']
        });

        children.add(child);
        pipeWithPrefix(child.stdout, process.stdout, label, onLine);
        pipeWithPrefix(child.stderr, process.stderr, label, onLine);
        child.once('close', () => children.delete(child));
        child.once('error', (error) => {
          log(label, `Failed to start: ${error.message}`, process.stderr);
        });

        return child;
      }

      function createOverlayPayload() {
        const activeDiagnostics = [diagnostics.typecheck, diagnostics.lint].filter(Boolean);
        if(!activeDiagnostics.length) {
          return;
        }

        return {
          type: 'error',
          err: {
            message: activeDiagnostics.map(({summary}) => summary).join(' · '),
            stack: activeDiagnostics.map(({label, output}) => {
              return `[${label}]\n${truncateOverlayOutput(output)}`;
            }).join('\n\n'),
            plugin: checksPluginName
          }
        };
      }

      function publishDiagnostics() {
        currentOverlayPayload = createOverlayPayload();

        if(currentOverlayPayload) {
          server.ws.send(currentOverlayPayload);
        } else {
          server.ws.send(clearEventName);
        }
      }

      function updateDiagnostics(source, value) {
        diagnostics[source] = value;
        publishDiagnostics();
      }

      function handleClientReady(_data, client) {
        if(currentOverlayPayload) {
          client.send(currentOverlayPayload);
        }
      }

      function runLint() {
        if(lint) {
          lintPending = true;
          return;
        }

        const lintLines = [];
        lint = run('oxlint', ['src'], 'lint', (line) => {
          if(line.trim()) {
            lintLines.push(line);
          }
        });
        lint.once('close', (exitCode) => {
          lint = undefined;

          if(!disposed) {
            const errorCount = lintLines.filter((line) => /:\s+error\b/.test(line)).length;
            const message = exitCode === 0 ?
              'No lint errors. Watching for changes.' :
              exitCode === 1 ?
                'Lint errors found. Watching for changes.' :
                `Lint process exited with code ${exitCode ?? 1}. Watching for changes.`;
            log('lint', message, exitCode === 0 ? process.stdout : process.stderr);

            updateDiagnostics('lint', exitCode === 0 ? undefined : {
              label: 'Oxlint',
              summary: exitCode === 1 ?
                `Oxlint: ${errorCount || 'some'} error${errorCount === 1 ? '' : 's'}` :
                'Oxlint process failed',
              output: lintLines.join('\n') || `Oxlint exited with code ${exitCode ?? 1}.`
            });
          }

          if(lintPending && !disposed) {
            lintPending = false;
            runLint();
          }
        });
      }

      function scheduleLint(_eventName, filename) {
        const relativePath = path.relative(sourceDir, path.resolve(filename));
        if(relativePath.startsWith('..') || path.isAbsolute(relativePath) || !sourceFilePattern.test(relativePath)) {
          return;
        }

        clearTimeout(lintTimer);
        lintTimer = setTimeout(runLint, 200);
      }

      let typecheckCollecting = false;
      let typecheckLines = [];

      function handleTypecheckLine(line) {
        if(
          line.includes('Starting compilation in watch mode') ||
          line.includes('File change detected. Starting incremental compilation')
        ) {
          typecheckCollecting = true;
          typecheckLines = [];
          return;
        }

        if(!typecheckCollecting) {
          return;
        }

        const summaryMatch = line.match(/Found (\d+) errors?\. Watching for file changes\./);
        if(summaryMatch) {
          const errorCount = Number(summaryMatch[1]);
          typecheckCollecting = false;
          updateDiagnostics('typecheck', errorCount ? {
            label: 'TypeScript',
            summary: `TypeScript: ${errorCount} error${errorCount === 1 ? '' : 's'}`,
            output: typecheckLines.join('\n')
          } : undefined);
          return;
        }

        if(line.trim()) {
          typecheckLines.push(line);
        }
      }

      const typecheck = run(
        'tsc',
        ['--noEmit', '--watch', '--preserveWatchOutput'],
        'typecheck',
        handleTypecheckLine
      );
      typecheck.once('close', (exitCode) => {
        if(!disposed) {
          log('typecheck', `Watcher exited with code ${exitCode ?? 1}.`, process.stderr);
          updateDiagnostics('typecheck', {
            label: 'TypeScript',
            summary: 'TypeScript watcher stopped',
            output: `TypeScript watcher exited with code ${exitCode ?? 1}.`
          });
        }
      });

      function dispose() {
        if(disposed) {
          return;
        }

        disposed = true;
        clearTimeout(lintTimer);
        server.watcher.off('all', scheduleLint);
        server.ws.off(readyEventName, handleClientReady);
        process.off('SIGINT', dispose);
        process.off('SIGTERM', dispose);

        for(const child of children) {
          if(!child.killed) {
            child.kill('SIGTERM');
          }
        }
      }

      server.watcher.on('all', scheduleLint);
      server.ws.on(readyEventName, handleClientReady);
      server.httpServer?.once('close', dispose);
      process.once('SIGINT', dispose);
      process.once('SIGTERM', dispose);
      runLint();
    }
  };
}
