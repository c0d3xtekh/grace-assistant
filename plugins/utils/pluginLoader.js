const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

/**
 * Clear require cache for plugin files
 * @param {string} pluginPath - Path to plugin file
 */
function clearPluginCache(pluginPath) {
  const resolvedPath = require.resolve(pluginPath);
  delete require.cache[resolvedPath];
}

/**
 * Clear all plugin caches
 */
function clearAllPluginCaches() {
  const pluginsDir = path.join(__dirname, '..');
  
  Object.keys(require.cache).forEach(key => {
    if (key.includes(pluginsDir) && !key.includes('pluginLoader.js')) {
      delete require.cache[key];
    }
  });
}

/**
 * Load all plugins from plugins directory
 * @param {boolean} isReload - Whether this is a reload operation
 * @returns {Object} { commands: Map, categories: Object }
 */
function loadPlugins(isReload = false) {
  if (isReload) {
    console.log(chalk.cyan('\n🔄 Reloading plugins...\n'));
    clearAllPluginCaches();
  }
  
  const commands = new Map();
  const categories = {};
  
  const pluginsDir = path.join(__dirname, '..');
  
  try {
    // Get all category folders
    const categoryFolders = fs.readdirSync(pluginsDir).filter(folder => {
      const folderPath = path.join(pluginsDir, folder);
      return fs.statSync(folderPath).isDirectory() && folder !== 'utils';
    });
    
    if (!isReload) {
      console.log(chalk.cyan(`📦 Loading plugins from ${categoryFolders.length} categories...\n`));
    }
    
    categoryFolders.forEach(categoryFolder => {
      const categoryPath = path.join(pluginsDir, categoryFolder);
      const categoryName = categoryFolder.replace('_cmds', '').toUpperCase();
      
      // Initialize category
      if (!categories[categoryName]) {
        categories[categoryName] = [];
      }
      
      // Get all .js files in category folder
      const pluginFiles = fs.readdirSync(categoryPath).filter(file => 
        file.endsWith('.js')
      );
      
      pluginFiles.forEach(file => {
        try {
          const pluginPath = path.join(categoryPath, file);
          
          // Clear cache if reloading
          if (isReload) {
            clearPluginCache(pluginPath);
          }
          
          const plugin = require(pluginPath);
          
          if (plugin.command && plugin.execute) {
            // Register command
            commands.set(plugin.command, plugin);
            
            // Add to category
            categories[categoryName].push({
              command: plugin.command,
              description: plugin.description || 'No description',
              aliases: plugin.aliases || []
            });
            
            const reloadPrefix = isReload ? '🔄' : '✅';
            console.log(chalk.green(`  ${reloadPrefix} Loaded: ${plugin.command} (${categoryName})`));
          } else {
            console.log(chalk.yellow(`  ⚠️  Skipped: ${file} (missing command or execute)`));
          }
        } catch (error) {
          console.log(chalk.red(`  ❌ Error loading ${file}: ${error.message}`));
        }
      });
    });
    
    const successMsg = isReload ? 
      `\n✅ Successfully reloaded ${commands.size} commands!\n` :
      `\n✅ Successfully loaded ${commands.size} commands!\n`;
    
    console.log(chalk.green(successMsg));
    
  } catch (error) {
    console.error(chalk.red('❌ Error loading plugins:'), error);
  }
  
  return { commands, categories };
}

module.exports = { loadPlugins };