const config = require('../../config');
const chalk = require('chalk');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function generateFooter() {
  const line = config.footer.line.repeat(config.footer.lineCount);
  return `${line}\n> _${config.footer.text}_`;
}

function getCurrentDateTime() {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toISOString().split('T')[1].split('.')[0];
  return `${date} ${time}`;
}

/**
 * Execute git command and return output
 */
function executeGitCommand(command) {
  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { success: true, output: output.trim() };
  } catch (error) {
    return { 
      success: false, 
      output: error.stdout?.trim() || '', 
      error: error.stderr?.trim() || error.message 
    };
  }
}

/**
 * Get authenticated git remote URL
 */
function getAuthenticatedRemoteUrl() {
  try {
    const gitConfigPath = path.join(process.cwd(), 'gitconfig.js');
    if (fs.existsSync(gitConfigPath)) {
      const gitConfig = require('../../gitconfig.js');
      if (gitConfig.github.token && gitConfig.github.username) {
        return gitConfig.remote.url.replace(
          'https://',
          `https://${gitConfig.github.username}:${gitConfig.github.token}@`
        );
      }
    }
  } catch (error) {
    console.error('Error getting authenticated URL:', error.message);
  }
  return null;
}

/**
 * Ensure .gitignore exists with proper exclusions
 */
function ensureGitignore() {
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  
  const requiredIgnores = [
    '# Node modules',
    'node_modules/',
    '',
    '# Session data',
    'session/',
    '',
    '# Temporary files',
    'temp/',
    '',
    '# Secrets',
    'secret/',
    '',
    '# Cache',
    '.cache/',
    '.npm/',
    '',
    '# Configuration (sensitive)',
    'config.js',
    '',
    '# PM2 logs',
    'logs/',
    '*.log',
    '',
    '# PM2 files',
    '.pm2/',
    'ecosystem.config.js',
    '',
    '# Environment',
    '.env',
    '.env.local',
    '',
    '# OS',
    '.DS_Store',
    'Thumbs.db',
    '',
    '# Backups',
    '*.zip',
    'grace-backup-*.zip',
    '',
    '# Contacts (optional)',
    'contacts/',
    ''
  ];

  let currentIgnores = [];
  if (fs.existsSync(gitignorePath)) {
    currentIgnores = fs.readFileSync(gitignorePath, 'utf-8').split('\n');
  }

  let updated = false;
  const finalIgnores = [...currentIgnores];

  requiredIgnores.forEach(line => {
    if (!currentIgnores.includes(line) && line.trim() !== '') {
      finalIgnores.push(line);
      updated = true;
    }
  });

  if (updated || !fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, finalIgnores.join('\n') + '\n');
    return true;
  }

  return false;
}

module.exports = {
  command: 'git',
  description: '🔧 Manage git operations (pull, push, status, etc.)',
  category: 'DEVELOPER',
  aliases: ['g'],

  async execute(conn, msg, args) {
    const sender = msg.key.remoteJid;
    const senderId = sender.split('@')[0];
    const currentTime = getCurrentDateTime();

    // Owner-only command
    if (senderId !== config.ownerNumber) {
      const notOwnerMsg = `❌ *Access Denied*

This command is only available to the bot owner.

${generateFooter()}`;
      await conn.sendMessage(sender, { text: notOwnerMsg });
      return;
    }

    // Check if git is initialized
    const gitDir = path.join(process.cwd(), '.git');
    if (!fs.existsSync(gitDir)) {
      const noGitMsg = `❌ *Git Not Initialized*

This directory is not a git repository.

*To initialize:*
\`\`\`
git init
git remote add origin <your-repo-url>
\`\`\`

${generateFooter()}`;
      await conn.sendMessage(sender, { text: noGitMsg });
      return;
    }

    // Ensure .gitignore is properly configured
    ensureGitignore();

    // If no subcommand, show help
    if (args.length === 0) {
      const helpMsg = `🔧 *Git Command Help*

*Usage:*
${config.prefix}git <subcommand> [options]

*Available Subcommands:*

📥 *pull* - Pull latest changes from remote
   ${config.prefix}git pull

📤 *push* - Push local changes to remote
   ${config.prefix}git push
   ${config.prefix}git push <message>

📊 *status* - Show git status
   ${config.prefix}git status

📝 *log* - Show recent commits (last 5)
   ${config.prefix}git log

🌿 *branch* - Show current branch
   ${config.prefix}git branch

🔄 *sync* - Pull then push (sync with remote)
   ${config.prefix}git sync
   ${config.prefix}git sync <message>

📋 *diff* - Show uncommitted changes
   ${config.prefix}git diff

🔍 *remote* - Show remote repository info
   ${config.prefix}git remote

*Examples:*
${config.prefix}git pull
${config.prefix}git push "Updated commands"
${config.prefix}git status
${config.prefix}git sync "Fixed bugs"

${generateFooter()}`;
      await conn.sendMessage(sender, { text: helpMsg });
      return;
    }

    const subcommand = args[0].toLowerCase();
    const subArgs = args.slice(1);

    console.log(chalk.blue('━'.repeat(60)));
    console.log(chalk.cyan.bold('🔧 GIT COMMAND EXECUTED'));
    console.log(chalk.white(`   User: ${senderId}`));
    console.log(chalk.white(`   Command: git ${subcommand}`));
    console.log(chalk.white(`   Time: ${currentTime}`));
    console.log(chalk.blue('━'.repeat(60)));

    try {
      switch (subcommand) {
        case 'pull': {
          const statusMsg = await conn.sendMessage(sender, {
            text: `📥 *Git Pull*\n\n⏳ Pulling latest changes from remote...\n\n${generateFooter()}`
          });

          const result = executeGitCommand('git pull');

          if (result.success) {
            const successMsg = `📥 *Git Pull - Success*

✅ Successfully pulled latest changes!

*Output:*
\`\`\`
${result.output || 'Already up to date'}
\`\`\`

🕐 Time: ${currentTime.split(' ')[1]} UTC

${generateFooter()}`;
            await conn.sendMessage(sender, { text: successMsg });
            console.log(chalk.green('✅ Git pull successful'));
          } else {
            throw new Error(result.error || 'Pull failed');
          }
          break;
        }

        case 'push': {
          const commitMessage = subArgs.join(' ') || 'Update from WhatsApp Bot';

          const statusMsg = await conn.sendMessage(sender, {
            text: `📤 *Git Push*\n\n⏳ Committing and pushing changes...\n\n${generateFooter()}`
          });

          // Add all changes
          const addResult = executeGitCommand('git add .');
          if (!addResult.success) {
            throw new Error('Failed to stage changes: ' + addResult.error);
          }

          // Commit
          const commitResult = executeGitCommand(`git commit -m "${commitMessage}"`);
          
          // Push
          const pushResult = executeGitCommand('git push');
          
          if (pushResult.success || pushResult.output.includes('up-to-date')) {
            const successMsg = `📤 *Git Push - Success*

✅ Successfully pushed changes!

*Commit Message:*
"${commitMessage}"

*Output:*
\`\`\`
${pushResult.output || commitResult.output || 'Changes pushed successfully'}
\`\`\`

🕐 Time: ${currentTime.split(' ')[1]} UTC

${generateFooter()}`;
            await conn.sendMessage(sender, { text: successMsg });
            console.log(chalk.green('✅ Git push successful'));
          } else {
            throw new Error(pushResult.error || 'Push failed');
          }
          break;
        }

        case 'status': {
          const result = executeGitCommand('git status --short');
          
          const statusMsg = `📊 *Git Status*

${result.output ? `\`\`\`\n${result.output}\n\`\`\`` : '✅ Working tree clean - no changes'}

🕐 Time: ${currentTime.split(' ')[1]} UTC

${generateFooter()}`;
          await conn.sendMessage(sender, { text: statusMsg });
          break;
        }

        case 'log': {
          const result = executeGitCommand('git log --oneline -5');
          
          const logMsg = `📝 *Git Log (Last 5 Commits)*

\`\`\`
${result.output || 'No commits yet'}
\`\`\`

🕐 Time: ${currentTime.split(' ')[1]} UTC

${generateFooter()}`;
          await conn.sendMessage(sender, { text: logMsg });
          break;
        }

        case 'branch': {
          const result = executeGitCommand('git branch --show-current');
          
          const branchMsg = `🌿 *Current Branch*

\`\`\`
${result.output || 'Unknown'}
\`\`\`

🕐 Time: ${currentTime.split(' ')[1]} UTC

${generateFooter()}`;
          await conn.sendMessage(sender, { text: branchMsg });
          break;
        }

        case 'sync': {
          const commitMessage = subArgs.join(' ') || 'Sync from WhatsApp Bot';

          const statusMsg = await conn.sendMessage(sender, {
            text: `🔄 *Git Sync*\n\n⏳ Syncing with remote...\n\n${generateFooter()}`
          });

          // Pull first
          const pullResult = executeGitCommand('git pull');
          if (!pullResult.success && !pullResult.output.includes('up-to-date')) {
            throw new Error('Pull failed: ' + pullResult.error);
          }

          // Add all changes
          executeGitCommand('git add .');

          // Commit
          const commitResult = executeGitCommand(`git commit -m "${commitMessage}"`);

          // Push
          const pushResult = executeGitCommand('git push');

          const syncMsg = `🔄 *Git Sync - Success*

✅ Successfully synced with remote!

*Commit Message:*
"${commitMessage}"

*Pull Output:*
\`\`\`
${pullResult.output || 'Already up to date'}
\`\`\`

*Push Output:*
\`\`\`
${pushResult.output || commitResult.output || 'Synced successfully'}
\`\`\`

🕐 Time: ${currentTime.split(' ')[1]} UTC

${generateFooter()}`;
          await conn.sendMessage(sender, { text: syncMsg });
          console.log(chalk.green('✅ Git sync successful'));
          break;
        }

        case 'diff': {
          const result = executeGitCommand('git diff --stat');
          
          const diffMsg = `📋 *Git Diff*

${result.output ? `\`\`\`\n${result.output}\n\`\`\`` : '✅ No uncommitted changes'}

🕐 Time: ${currentTime.split(' ')[1]} UTC

${generateFooter()}`;
          await conn.sendMessage(sender, { text: diffMsg });
          break;
        }

        case 'remote': {
          const result = executeGitCommand('git remote -v');
          
          const remoteMsg = `🔍 *Git Remote*

\`\`\`
${result.output || 'No remote configured'}
\`\`\`

🕐 Time: ${currentTime.split(' ')[1]} UTC

${generateFooter()}`;
          await conn.sendMessage(sender, { text: remoteMsg });
          break;
        }

        default: {
          const unknownMsg = `❌ *Unknown Subcommand*

Unknown git subcommand: \`${subcommand}\`

Use \`${config.prefix}git\` to see available commands.

${generateFooter()}`;
          await conn.sendMessage(sender, { text: unknownMsg });
        }
      }

    } catch (error) {
      console.error(chalk.red('❌ Git command error:'), error.message);

      const errorMsg = `❌ *Git Command Failed*

*Subcommand:* ${subcommand}
*Error:* ${error.message}

*Possible causes:*
• No changes to commit
• Merge conflicts
• Authentication issues
• Network problems

*Tip:* Check git configuration and try again.

${generateFooter()}`;

      await conn.sendMessage(sender, { text: errorMsg });
    }

    console.log(chalk.blue('━'.repeat(60)));
    console.log('');
  }
};