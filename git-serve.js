// @ts-check

// Thanks to https://github.com/mbostock/git-static

var child = require("child_process"),
    mime = require("mime"),
    path = require("path");

var shaRe = /^[0-9a-f]{40}$/,
    emailRe = /^<.*@.*>$/;

function readBlob(repository, revision, file, callback) {
  var git = child.spawn("git", ["cat-file", "blob", revision + ":" + file], {cwd: repository}),
      data = [],
      exit;

  git.stdout.on("data", function(chunk) {
    data.push(chunk);
  });

  git.on("exit", function(code) {
    exit = code;
  });

  git.on("close", function() {
    if (exit > 0) return callback(error(exit));
    callback(null, Buffer.concat(data));
  });

  git.stdin.end();
}

exports.readBlob = readBlob;

exports.getBranches = function(repository, callback) {
  child.exec("git branch -l", {cwd: repository}, function(error, stdout) {
    if (error) return callback(error);
    callback(null, stdout.split(/\n/).slice(0, -1).map(function(s) { return s.slice(2); }));
  });
};

exports.getSha = function(repository, revision, callback) {
  child.exec("git rev-parse '" + revision.replace(/'/g, "'\''") + "'", {cwd: repository}, function(error, stdout) {
    if (error) return callback(error);
    callback(null, stdout.trim());
  });
};

exports.getBranchCommits = function(repository, callback) {
  child.exec("git for-each-ref refs/heads/ --sort=-authordate --format='%(objectname)\t%(refname:short)\t%(authordate:iso8601)\t%(authoremail)'", {cwd: repository}, function(error, stdout) {
    if (error) return callback(error);
    callback(null, stdout.split("\n").map(function(line) {
      var fields = line.split("\t"),
          sha = fields[0],
          ref = fields[1],
          date = new Date(fields[2]),
          author = fields[3];
      if (!shaRe.test(sha) || !date || !emailRe.test(author)) return;
      return {
        sha: sha,
        ref: ref,
        date: date,
        author: author.substring(1, author.length - 1)
      };
    }).filter(function(commit) {
      return commit;
    }));
  });
};

exports.getCommit = function(repository, revision, callback) {
  if (arguments.length < 3) callback = revision, revision = null;
  child.exec(shaRe.test(revision)
      ? "git log -1 --date=iso " + revision + " --format='%H\n%ad'"
      : "git for-each-ref --count 1 --sort=-authordate 'refs/heads/" + (revision ? revision.replace(/'/g, "'\''") : "") + "' --format='%(objectname)\n%(authordate:iso8601)'", {cwd: repository}, function(error, stdout) {
    if (error) return callback(error);
    var lines = stdout.split("\n"),
        sha = lines[0],
        date = new Date(lines[1]);
    if (!shaRe.test(sha) || !date) return void callback(new Error("unable to get commit"));
    callback(null, {
      sha: sha,
      date: date
    });
  });
};

exports.getRelatedCommits = function(repository, branch, sha, callback) {
  if (!shaRe.test(sha)) return callback(new Error("invalid SHA: " + sha));
  child.exec("git log --format='%H' '" + branch.replace(/'/g, "'\''") + "' | grep -C1 " + sha, {cwd: repository}, function(error, stdout) {
    if (error) return callback(error);
    var shas = stdout.split(/\n/),
        i = shas.indexOf(sha);

    callback(null, {
      previous: shas[i + 1],
      next: shas[i - 1]
    });
  });
};

exports.listCommits = function(repository, sha1, sha2, callback) {
  if (!shaRe.test(sha1)) return callback(new Error("invalid SHA: " + sha1));
  if (!shaRe.test(sha2)) return callback(new Error("invalid SHA: " + sha2));
  child.exec("git log --format='%H\t%ad' " + sha1 + ".." + sha2, {cwd: repository}, function(error, stdout) {
    if (error) return callback(error);
    callback(null, stdout.split(/\n/).slice(0, -1).map(function(commit) {
      var fields = commit.split(/\t/);
      return {
        sha: fields[0],
        date: new Date(fields[1])
      };
    }));
  });
};

/** @type {(repository: string, callback: (err: Error, commits?: {sha: string, date: Date, author: string, subject: string}[]) => void) => void} */
exports.listAllCommits = function(repository, callback) {
  child.exec("git log --branches --format='%H\t%ad\t%an\t%s'", {cwd: repository}, function(error, stdout) {
    if (error) return callback(error);
    callback(null, stdout.split(/\n/).slice(0, -1).map(function(commit) {
      var fields = commit.split(/\t/);
      return {
        sha: fields[0],
        date: new Date(fields[1]),
        author: fields[2],
        subject: fields[3]
      };
    }));
  });
};

exports.listTree = function(repository, revision, callback) {
  child.exec("git ls-tree -r " + revision, {cwd: repository}, function(error, stdout) {
    if (error) return callback(error);
    callback(null, stdout.split(/\n/).slice(0, -1).map(function(commit) {
      var fields = commit.split(/\t/);
      return {
        sha: fields[0].split(/\s/)[2],
        name: fields[1]
      };
    }));
  });
};

exports.route = function() {
  var repository = defaultRepository,
      revision = defaultRevision,
      file = defaultFile,
      type = defaultType;

  function route(request, response) {
    var repository_,
        revision_,
        file_;

        // @ts-ignore
    if ((repository_ = repository(request.url)) == null
        || (revision_ = revision(request.url)) == null
        || (file_ = file(request.url)) == null) return serveNotFound();

    readBlob(repository_, revision_, file_, function(error, data) {
      if (error) return error.code === 128 ? serveNotFound() : serveError(error);
      response.writeHead(200, {
        "Content-Type": type(file_),
        "Cache-Control": "public, max-age=300"
      });
      response.end(data);
    });

    function serveError(error) {
      response.writeHead(500, {"Content-Type": "text/plain"});
      response.end(error + "");
    }

    function serveNotFound() {
      response.writeHead(404, {"Content-Type": "text/plain"});
      response.end("File not found.");
    }
  }

  route.repository = function(_) {
    if (!arguments.length) return repository;
    repository = functor(_);
    return route;
  };

  route.sha = // sha is deprecated; use revision instead
  route.revision = function(_) {
    if (!arguments.length) return revision;
    revision = functor(_);
    return route;
  };

  route.file = function(_) {
    if (!arguments.length) return file;
    file = functor(_);
    return route;
  };

  route.type = function(_) {
    if (!arguments.length) return type;
    type = functor(_);
    return route;
  };

  return route;
};

function functor(_) {
  return typeof _ === "function" ? _ : function() { return _; };
}

function defaultRepository() {
  return path.join(__dirname, "repository");
}

function defaultRevision(url) {
  return decodeURIComponent(url.substring(1, url.indexOf("/", 1)));
}

function defaultFile(url) {
  url = url.substring(url.indexOf("/", 1) + 1);
  const pathIdx = url.indexOf('?');
  if(pathIdx !== -1) {
    url = url.slice(0, pathIdx);
  }

  return decodeURIComponent(url);
}

function defaultType(file) {
  var type = mime.getType(file) || "text/plain";
  return text(type) ? type + "; charset=utf-8" : type;
}

function text(type) {
  return /^(text\/)|(application\/(javascript|json)|image\/svg$)/.test(type);
}

function error(code) {
  var e = new Error;
  // @ts-ignore
  e.code = code;
  return e;
}
