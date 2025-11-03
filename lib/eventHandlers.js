const chalk = require('chalk');

/**
 * eventHandlers.js
 * Central registry for all event handlers
 * This allows us to easily add/remove handlers for various WhatsApp events
 */

// Import all handlers
const { handleViewOnce } = require('./handlers/viewOnceHandler');

/**
 * List of all active event handlers
 * Each handler receives (conn, msg) parameters
 */
const messageHandlers = [
  {
    name: 'ViewOnce Extractor',
    handler: handleViewOnce,
    enabled: true,
    description: 'Automatically extracts ViewOnce media when replied to'
  }
  // Add more handlers here as needed
  // {
  //   name: 'Status Saver',
  //   handler: handleStatusSave,
  //   enabled: true,
  //   description: 'Automatically saves status updates'
  // }
];

/**
 * Execute all enabled message handlers
 */
async function executeMessageHandlers(conn, msg) {
  for (const handlerConfig of messageHandlers) {
    if (!handlerConfig.enabled) continue;

    try {
      await handlerConfig.handler(conn, msg);
    } catch (error) {
      // Silently handle errors to not disrupt message flow
      // Only log non-decryption errors
      if (!error.message?.includes('decrypt') && !error.message?.includes('MAC')) {
        console.error(
          chalk.red(`❌ Handler error [${handlerConfig.name}]:`),
          error.message
        );
      }
    }
  }
}

/**
 * Get list of active handlers
 */
function getActiveHandlers() {
  return messageHandlers.filter(h => h.enabled);
}

/**
 * Enable/disable a handler by name
 */
function toggleHandler(name, enabled) {
  const handler = messageHandlers.find(h => h.name === name);
  if (handler) {
    handler.enabled = enabled;
    return true;
  }
  return false;
}

/**
 * Display loaded handlers on startup
 */
function displayHandlers() {
  const active = getActiveHandlers();
  if (active.length > 0) {
    console.log(chalk.cyan('\n📡 Active Event Handlers:'));
    active.forEach(h => {
      console.log(chalk.green(`   ✅ ${h.name} - ${h.description}`));
    });
    console.log('');
  }
}

module.exports = {
  executeMessageHandlers,
  getActiveHandlers,
  toggleHandler,
  displayHandlers
};