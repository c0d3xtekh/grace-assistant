const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

/**
 * Setup git configuration from gitconfig.js
 */
function setupGitConfig() {
  try {
    // Check if gitconfig.js exists
    const gitConfigPath = path.join(process.cwd(), 'gitconfig.js');
    
    if (!fs.existsSync(gitConfigPath)) {
      console.log(chalk.yellow('⚠️  gitconfig.js not found. Git authentication not configured.'));
      return false;
    }

    const gitConfig = require('../gitconfig.js');

    // Set git user name and email
    execSync(`git config user.name "${gitConfig.user.name}"`, { stdio: 'ignore' });
    execSync(`git config user.email "${gitConfig.user.email}"`, { stdio: 'ignore' });

    // Set credential helper to store
    execSync('git config credential.helper store', { stdio: 'ignore' });

    // Create .git-credentials file with token
    if (gitConfig.github.token && gitConfig.github.username) {
      const credentialsPath = path.join(require('os').homedir(), '.git-credentials');
      const credentialLine = `https://${gitConfig.github.username}:${gitConfig.github.token}@github.com\n`;
      
      let existingCredentials = '';
      if (fs.existsSync(credentialsPath)) {
        existingCredentials = fs.readFileSync(credentialsPath, 'utf-8');
      }

      // Only add if not already present
      if (!existingCredentials.includes(gitConfig.github.username)) {
        fs.appendFileSync(credentialsPath, credentialLine);
      }
    }

    console.log(chalk.green('✅ Git configuration loaded successfully'));
    return true;

  } catch (error) {
    console.error(chalk.red('❌ Error setting up git config:'), error.message);
    return false;
  }
}

module.exports = { setupGitConfig };