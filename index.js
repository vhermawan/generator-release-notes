const { exec } = require('child_process');
const { Octokit } = require('@octokit/rest');
const core = require('@actions/core')
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const GITHUB_URL = 'https://github.com'
const TITLE_GROUP_RELEASE = {
  feat: 'Feature 🚀',
  fix: 'Bug Fix 🐛',
  chore: 'Chore 💎',
  docs: 'Document 🗎'
};

function getInputGithub() {
  return {
    owner: core.getInput('owner') || undefined,
    repository: core.getInput('repository') || undefined,
    token: core.getInput('token') || undefined,
  }
}

const octokit = new Octokit({
  auth: getInputGithub().token, request: {
    fetch: fetch,
  },
});
const date = new Date().toLocaleDateString();

function getListTag() {
  return new Promise((resolve, reject) => {
    exec(`git for-each-ref --sort=-creatordate --format="%(refname:short)" "refs/tags/v*"`, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      if (stderr) {
        reject(stderr);
        return;
      }
      const tag = stdout.trim().split(/\s+/);
      resolve(tag);
    });
  });
};

function convertGroupedCommitsToString(groupedCommits, previousTag, lastTag) {
  let result = '';

  let titleRelease = `## ${lastTag} (${date}) \n`;
  if (previousTag) {
    titleRelease = `## [${lastTag}](${GITHUB_URL}/${getInputGithub().owner}/${getInputGithub().repository}/compare/${previousTag}...${lastTag}) (${date}) \n`
  }

  result += titleRelease
  const commitTypeOrder = ["feat", "fix", "chore", "docs", "others"];

  for (let type of commitTypeOrder) {
    if (groupedCommits[type]) {
      const displayTitle = TITLE_GROUP_RELEASE[type] || capitalizeFirstLetter(type);
      result += `### ${displayTitle} :\n`;
      for (let commit of groupedCommits[type]) {
        result += `- ${commit.message} \n`;
      }
      result += '\n';
    }
  }

  return result;
};

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
};

function formatCommitMessage(message) {
  return message.replace(/\(#(\d+)\)/, (_, prNumber) => {
    return `[#${prNumber}](${GITHUB_URL}/${getInputGithub().owner}/${getInputGithub().repository}/pull/${prNumber})`;
  });
};

function grouppingCommit(message, acc, type, username) {
  const messageFormated = formatCommitMessage(message)
  if (!acc[type]) {
    acc[type] = [];
  }
  acc[type].push({ message: formatCommitMessage(messageFormated) + ' by ' + username });
}

function createReleaseNotes(previousTag, lastTag) {
  return new Promise((resolve, reject) => {
    const compareTag = previousTag ? `${previousTag}..${lastTag}` : `${lastTag}`

    exec(`git log ${compareTag} --pretty=format:"%ae: %s"`, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        reject(error);
      }

      if (stderr) {
        reject(stderr);
        return;
      }

      const commits = stdout.split('\n').filter(commit => commit);
      const groupedCommits = commits.reduce((acc, commit) => {
        let [username, message] = commit.split(/: (.+)/);

        const spitUsername = username.match(/\+(.*?)@users.noreply.github.com/);
        const usernameFormated = spitUsername ? `[${spitUsername[1]}](https://github.com/${spitUsername[1]})` : null;

        /**use for checking commit eg: feat(FE): */
        const match = message.trim().match(/^(feat|fix|chore|docs|style|refactor|perf|test)\(([^)]+)\): (.+)$/);
        if (match) {
          const message = `**${match[2]}**: ${match[3]}`;
          const type = match[1]
          grouppingCommit(message, acc, type, usernameFormated)
        } else {
          /**use for checking commit eg: feat: */
          const matchPrefix = message.trim().match(/^(feat|fix|chore|docs|style|refactor|perf|test): (.+)$/);
          if (matchPrefix) {
            const message = matchPrefix[2];
            const type = matchPrefix[1]
            grouppingCommit(message, acc, type, usernameFormated)
          } else {
            if (!acc['others']) {
              acc['others'] = [];
            }
            acc['others'].push({ message: formatCommitMessage(message.trim()) + ' by ' + usernameFormated });
          }
        }
        return acc;
      }, {});

      const formattedOutput = convertGroupedCommitsToString(groupedCommits, previousTag, lastTag);
      resolve(formattedOutput)
    })
  })
};

async function preRelease(tags) {
  if (tags[0].includes("-rc.")) {
    try {
      const result = await createReleaseNotes(tags[1], tags[0]);
      createReleaseNote(result, tags[0])
    } catch (error) {
      console.error(`An error occurred: ${error}`);
      return error
    }
  } else {
    const latestRcTag = tags.find(tag => tag.includes("-rc."));
    try {
      const result = await createReleaseNotes(tags[0], latestRcTag);
      createReleaseNote(result, latestRcTag)
    } catch (error) {
      console.error(`An error occurred: ${error}`);
      return error
    }
  }
};

async function release(tags) {
  const releaseTags = tags.filter(tag => !tag.includes("-rc."));
  try {
    const result = await createReleaseNotes(releaseTags[1], releaseTags[0]);
    createReleaseNote(result, releaseTags[0])
  } catch (error) {
    console.error(`An error occurred: ${error}`);
    return error
  }
};

async function createReleaseNote(body, tag) {
  try {
    await octokit.repos.createRelease({
      owner: getInputGithub().owner,
      repo: getInputGithub().repository,
      tag_name: tag,
      name: `Release ${tag}`,
      body,
      draft: false,
      prerelease: tag.includes("-rc."),
    });
  } catch (err) {
    console.error("Error creating release:", err);
    return err
  }
};

async function main() {
  try {
    const listTag = await getListTag();

    if (listTag[0] === "") {
      core.setFailed('There are no tag, please create tag before')
      return;
    }

    if (listTag[0].includes("-rc.")) {
      preRelease(listTag)
    } else {
      release(listTag)
    };

  } catch (error) {
    core.setFailed(error)
    return error
  }
};

main();