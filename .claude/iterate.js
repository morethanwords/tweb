#!/usr/bin/env node
'use strict';

// Iterative Task Runner
// Runs Claude Code in a loop to complete tasks from a planner-created folder
//
// Usage: node .claude/iterate.js <featurename> [options]
//
// Arguments:
//   featurename          Name of the folder in .claude/work/ containing prompt.md and tasks.json
//
// Options:
//   --max-iterations N   Maximum iterations before stopping (default: 50)
//   --interactive        Pause between iterations for user confirmation
//   --dry-run            Show what would be executed without running
//   --single-commit      Don't commit after each task, commit all changes at the end
//   --no-commit          Don't commit at all

const {spawn} = require('child_process');
const {readFileSync, existsSync} = require('fs');
const {join, resolve} = require('path');
const readline = require('readline');

// ANSI color codes
const c = {
  reset: '\x1b[0m',
  white: '\x1b[37m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  darkCyan: '\x1b[36m',
  darkGray: '\x1b[90m'
};

function col(text, color) {
  return `${color}${text}${c.reset}`;
}

function formatDuration(seconds) {
  if(seconds < 60) return `${seconds}s`;
  if(seconds < 3600) {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}m ${sec}s`;
  }
  const hr = Math.floor(seconds / 3600);
  const min = Math.floor((seconds % 3600) / 60);
  const sec = seconds % 60;
  return `${hr}h ${min}m ${sec}s`;
}

function showClaudeStream(line) {
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    return;
  }

  switch(obj.type) {
    case 'assistant': {
      if(obj.message && obj.message.content) {
        for(const block of obj.message.content) {
          if(block.type === 'text') {
            process.stdout.write(col(block.text, c.white) + '\n');
          } else if(block.type === 'tool_use') {
            let summary = '';
            if(block.input) {
              if(block.input.file_path) {
                summary = block.input.file_path;
              } else if(block.input.pattern) {
                summary = block.input.pattern;
              } else if(block.input.command) {
                let cmd = block.input.command;
                if(cmd.length > 60) cmd = cmd.substring(0, 60) + '...';
                summary = cmd;
              } else {
                let inputStr = JSON.stringify(block.input);
                if(inputStr.length > 60) inputStr = inputStr.substring(0, 60) + '...';
                summary = inputStr;
              }
            }
            process.stdout.write(col(`[Tool: ${block.name}] ${summary}`, c.yellow) + '\n');
          }
        }
      }
      break;
    }
    case 'user':
      // Tool results — skip verbose output
      break;
    case 'result': {
      process.stdout.write(col('\n--- Session Complete ---', c.cyan) + '\n');
      if(obj.cost_usd) {
        process.stdout.write(col(`Cost: $${obj.cost_usd}`, c.darkCyan) + '\n');
      }
      break;
    }
    case 'system':
      // System messages — skip
      break;
  }
}

function runClaude(prompt, cwd) {
  return new Promise((res, rej) => {
    const proc = spawn('claude', [
      '--dangerously-skip-permissions',
      '--verbose',
      '-p', prompt,
      '--output-format', 'stream-json',
      '--model', model,
    ], {cwd, stdio: ['ignore', 'pipe', 'pipe']});

    let buffer = '';

    proc.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for(const line of lines) {
        if(line.trim()) showClaudeStream(line);
      }
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      if(text.trim()) process.stderr.write(text);
    });

    proc.on('close', (code) => {
      if(buffer.trim()) showClaudeStream(buffer);
      if(code === 0 || code === null) res();
      else rej(new Error(`claude exited with code ${code}`));
    });

    proc.on('error', rej);
  });
}

function askToContinue() {
  return new Promise((res) => {
    const rl = readline.createInterface({input: process.stdin, output: process.stdout});
    rl.question(col('Press Enter to continue, Ctrl+C to stop...', c.cyan) + '\n', () => {
      rl.close();
      res();
    });
  });
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// --- Parse arguments ---

const args = process.argv.slice(2);

if(args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node .claude/iterate.js <featurename> [options]

Arguments:
  featurename          Name of the folder in .claude/work/ containing prompt.md and tasks.json

Options:
  --max-iterations N   Maximum iterations before stopping (default: 50)
  --interactive        Pause between iterations for user confirmation
  --dry-run            Show what would be executed without running
  --single-commit      Don't commit after each task, commit all changes at the end
  --no-commit          Don't commit at all
  --model MODEL        Claude model to use (default: opus)`);
  process.exit(0);
}

let featureName = null;
let maxIterations = 50;
let interactive = false;
let dryRun = false;
let singleCommit = false;
let noCommit = false;
let model = 'opus';

for(let i = 0; i < args.length; i++) {
  const arg = args[i];
  if(arg === '--max-iterations') {
    maxIterations = parseInt(args[++i], 10);
  } else if(arg === '--interactive') {
    interactive = true;
  } else if(arg === '--dry-run') {
    dryRun = true;
  } else if(arg === '--single-commit') {
    singleCommit = true;
  } else if(arg === '--no-commit') {
    noCommit = true;
  } else if(arg === '--model') {
    model = args[++i];
  } else if(!arg.startsWith('--')) {
    featureName = arg;
  }
}

if(!featureName) {
  console.error('Error: featurename is required');
  process.exit(1);
}

const scriptDir = __dirname;
const repoRoot = resolve(join(scriptDir, '..'));
const workDir = join(repoRoot, '.ai', featureName);
const promptMd = join(workDir, 'prompt.md');
const tasksJson = join(workDir, 'tasks.json');

// Verify feature folder and required files exist
if(!existsSync(workDir)) {
  console.error(`Error: Feature folder not found: ${workDir}\nRun '/planner ${featureName}' first to create it. (creates .ai/${featureName}/)`);
  process.exit(1);
}

for(const file of [promptMd, tasksJson]) {
  if(!existsSync(file)) {
    console.error(`Error: Required file not found: ${file}`);
    process.exit(1);
  }
}

// --- Build prompts ---

const afterImplementation = (singleCommit || noCommit)
  ? `   - Mark the task completed in tasks.json ("completed": true)
   - If new tasks emerged, add them to tasks.json`
  : `   - Mark the task completed in tasks.json ("completed": true)
   - Commit your changes
   - If new tasks emerged, add them to tasks.json`;

const commitRule = (singleCommit || noCommit)
  ? '- Do NOT commit changes after the task is done, just mark it as done in tasks.json. Commit will be done when all tasks are complete, separately.'
  : '';

const mainPrompt = `You are an autonomous coding agent working on: ${featureName}

Read these files for context:
- .ai/${featureName}/prompt.md - Detailed instructions and architecture
- .ai/${featureName}/tasks.json - Task list with completion status

Do exactly ONE task per iteration.

## Steps

1. Read tasks.json and find the most suitable task to implement (it can be the first uncompleted task or one in the middle if better suited right now, respecting dependencies)
2. Use /ultrathink to plan the implementation carefully
3. Implement that ONE task only
4. After successful implementation:
${afterImplementation}

## Critical Rules

- Only mark a task complete if you verified the work is done (pnpm lint passes, TypeScript types check, etc.)
- If stuck, document the issue in the task's notes field and move on
- Do ONE task per iteration, then stop
- NEVER try to commit files in .ai/
${commitRule}

## Completion Signal

If ALL tasks in tasks.json have "completed": true, output exactly:
===ALL_TASKS_COMPLETE===`;

const commitPrompt = `You are an autonomous coding agent. All tasks for "${featureName}" are now complete.

Your job: Create a single commit with all the changes.

## Steps

1. Run git status to see all modified files
2. Run git diff to review the changes
3. Create a commit with a short summary (aim for ~50 chars, max 76 chars) describing what was implemented
4. The commit message should describe the overall feature/fix, not list individual changes

## Critical Rules

- NEVER try to commit files in .ai/
- Use a concise commit message that captures the essence of the work done`;

// --- Header ---

console.log('');
console.log(col('========================================', c.cyan));
console.log(col('  Iterative Task Runner', c.cyan));
console.log(col(`  Feature: ${featureName}`, c.cyan));
console.log(col(`  Max iterations: ${maxIterations}`, c.cyan));
console.log(col(`  Mode: ${interactive ? 'Interactive' : 'Auto'}`, c.cyan));
console.log(col(`  Model: ${model}`, c.cyan));
console.log(col(`  Commit: ${noCommit ? 'None' : singleCommit ? 'Single (at end)' : 'Per task'}`, c.cyan));
console.log(col(`  Working directory: ${repoRoot}`, c.cyan));
console.log(col('========================================', c.cyan));
console.log('');

if(dryRun) {
  console.log(col('[DRY RUN] Would execute with prompt:', c.yellow));
  console.log(mainPrompt);
  console.log('');
  console.log(col(`Feature folder: ${workDir}`, c.yellow));
  console.log(col(`Prompt file: ${promptMd}`, c.yellow));
  console.log(col(`Tasks file: ${tasksJson}`, c.yellow));
  process.exit(0);
}

// --- Main loop ---

async function main() {
  const scriptStartTime = Date.now();
  const iterationTimes = [];

  for(let i = 1; i <= maxIterations; i++) {
    console.log('');
    console.log(col('========================================', c.yellow));
    console.log(col(`  Iteration ${i} of ${maxIterations}`, c.yellow));
    console.log(col('========================================', c.yellow));
    console.log('');

    const iterStart = Date.now();

    try {
      await runClaude(mainPrompt, repoRoot);
    } catch(err) {
      console.error(col(`Error running claude: ${err.message}`, c.red));
      process.exit(1);
    }

    const iterDuration = Math.floor((Date.now() - iterStart) / 1000);
    iterationTimes.push(iterDuration);
    console.log(col(`Iteration time: ${formatDuration(iterDuration)}`, c.darkCyan));

    // Check task completion
    let tasks;
    try {
      tasks = JSON.parse(readFileSync(tasksJson, 'utf8'));
    } catch(err) {
      console.error(col(`Error reading tasks.json: ${err.message}`, c.red));
      process.exit(1);
    }

    const incomplete = (tasks.tasks || []).filter(t => !t.completed);
    const inProgress = (tasks.tasks || []).filter(t => t.started && !t.completed);

    if(incomplete.length === 0) {
      if(singleCommit && !noCommit) {
        i++;
        if(i <= maxIterations) {
          console.log('');
          console.log(col('========================================', c.yellow));
          console.log(col('  Final commit iteration', c.yellow));
          console.log(col('========================================', c.yellow));
          console.log('');

          const commitStart = Date.now();

          try {
            await runClaude(commitPrompt, repoRoot);
          } catch(err) {
            console.error(col(`Error running claude for commit: ${err.message}`, c.red));
            process.exit(1);
          }

          const commitDuration = Math.floor((Date.now() - commitStart) / 1000);
          iterationTimes.push(commitDuration);
          console.log(col(`Commit time: ${formatDuration(commitDuration)}`, c.darkCyan));
        } else {
          console.log('');
          console.log(col('========================================', c.red));
          console.log(col('  Max iterations reached before commit', c.red));
          console.log(col('  Run manually: git add . && git commit', c.red));
          console.log(col('========================================', c.red));
          console.log('');
          process.exit(1);
        }
      }

      const totalTime = Math.floor((Date.now() - scriptStartTime) / 1000);
      const avgTime = iterationTimes.length > 0
        ? Math.floor(iterationTimes.reduce((a, b) => a + b, 0) / iterationTimes.length)
        : 0;

      console.log('');
      console.log(col('========================================', c.green));
      console.log(col('  ALL TASKS COMPLETE!', c.green));
      console.log(col(`  Feature: ${featureName}`, c.green));
      console.log(col(`  Iterations: ${iterationTimes.length}`, c.green));
      console.log(col(`  Total time: ${formatDuration(totalTime)}`, c.green));
      console.log(col(`  Avg per iteration: ${formatDuration(avgTime)}`, c.green));
      console.log(col('========================================', c.green));
      console.log('');
      process.exit(0);
    }

    console.log('');
    console.log(col(`Remaining tasks: ${incomplete.length}`, c.cyan));
    if(inProgress.length > 0) {
      console.log(col(`In progress: ${inProgress[0].title}`, c.yellow));
    }

    if(interactive) {
      await askToContinue();
    } else {
      await sleep(2000);
    }
  }

  const totalTime = Math.floor((Date.now() - scriptStartTime) / 1000);
  const avgTime = iterationTimes.length > 0
    ? Math.floor(iterationTimes.reduce((a, b) => a + b, 0) / iterationTimes.length)
    : 0;

  console.log('');
  console.log(col('========================================', c.red));
  console.log(col(`  Max iterations (${maxIterations}) reached`, c.red));
  console.log(col('  Check tasks.json for remaining tasks', c.red));
  console.log(col(`  Total time: ${formatDuration(totalTime)}`, c.red));
  console.log(col(`  Avg per iteration: ${formatDuration(avgTime)}`, c.red));
  console.log(col('========================================', c.red));
  console.log('');
  process.exit(1);
}

main().catch(err => {
  console.error(col(`Fatal error: ${err.message}`, c.red));
  process.exit(1);
});
