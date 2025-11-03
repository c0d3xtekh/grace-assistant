/**
 * Grace Assistant – WhatsApp Bot
 * Dynamic Plugin System with Categories
 * Auto-reaction handling with removal after 10 seconds
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  isJidBroadcast
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const chalk = require('chalk');
const figlet = require('figlet');
const fs = require('fs');
const readline = require('readline');
const { Boom } = require('@hapi/boom');
const NodeCache = require('node-cache');
const { parsePhoneNumberFromString } = require('libphonenumber-js');
const config = require('./config');
const { loadPlugins } = require('./plugins/utils/pluginLoader');
const { executeMessageHandlers, displayHandlers } = require('./lib/eventHandlers');
const { setupGitConfig } = require('./lib/gitSetup');

/* ------------------------------------------------------------------ */
/*  Configuration from config.js                                      */
/* ------------------------------------------------------------------ */
const phoneNumber = config.phoneNumber;
const PREFIX = config.prefix;
const BOT_NAME = config.botName;
const OWNER_NAME = config.ownerName;
const OWNER_NUMBER = config.ownerNumber;
const FOOTER = config.footer;
const REACTION_DURATION = config.reaction.duration;

const pairingCode = !!phoneNumber || process.argv.includes("--pairing-code");
const useMobile = process.argv.includes("--mobile");

const rl = readline.createInterface({ 
  input: process.stdin, 
  output: process.stdout 
});

const question = (text) => new Promise((resolve) => rl.question(text, resolve));

/* ------------------------------------------------------------------ */
/*  Load Plugins                                                      */
/* ------------------------------------------------------------------ */
//const { commands, categories } = loadPlugins();

/* ------------------------------------------------------------------ */
/*  Load Plugins                                                      */
/* ------------------------------------------------------------------ */
let { commands, categories } = loadPlugins();

// Create global context for hot reload
const globalContext = { commands, categories };

/* ------------------------------------------------------------------ */
/*  Helper: Generate Footer                                           */
/* ------------------------------------------------------------------ */
function generateFooter() {
  const line = FOOTER.line.repeat(FOOTER.lineCount);
  return `${line}\n> _${FOOTER.text}_`;
}

/* ------------------------------------------------------------------ */
/*  Helper: Get Current Date/Time                                     */
/* ------------------------------------------------------------------ */
function getCurrentDateTime() {
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const time = now.toISOString().split('T')[1].split('.')[0]; // HH:MM:SS
  return `${date} ${time}`;
}

/* ------------------------------------------------------------------ */
/*  Helper: React to Message                                          */
/* ------------------------------------------------------------------ */
async function reactToMessage(conn, msg, emoji) {
  try {
    await conn.sendMessage(msg.key.remoteJid, {
      react: {
        text: emoji,
        key: msg.key
      }
    });
  } catch (error) {
    // Silently handle reaction errors
  }
}

/* ------------------------------------------------------------------ */
/*  Helper: Remove Reaction                                           */
/* ------------------------------------------------------------------ */
async function removeReaction(conn, msg) {
  try {
    await conn.sendMessage(msg.key.remoteJid, {
      react: {
        text: '',
        key: msg.key
      }
    });
  } catch (error) {
    // Silently handle reaction errors
  }
}

/* ------------------------------------------------------------------ */
/*  Suppress unwanted logs                                            */
/* ------------------------------------------------------------------ */
function shouldSuppressLog(joined) {
  return (
    joined.includes("Closing stale open session") ||
    joined.includes("Closing session: SessionEntry") ||
    joined.includes("Removing old closed session") ||
    joined.includes("Restoring closed session") ||
    joined.includes("Restoring open session") ||
    joined.includes("SessionEntry")
  );
}

function patchConsoleMethod(methodName) {
  const original = console[methodName];
  console[methodName] = (...args) => {
    const joined = args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
    if (shouldSuppressLog(joined)) return;
    original(...args);
  };
}

["log", "info", "warn", "error"].forEach(patchConsoleMethod);

const originalStdoutWrite = process.stdout.write;
process.stdout.write = function (string, ...args) {
  if (shouldSuppressLog(string)) return;
  return originalStdoutWrite.apply(process.stdout, [string, ...args]);
};

/* ------------------------------------------------------------------ */
/*  UI helpers                                                        */
/* ------------------------------------------------------------------ */
function displayBanner() {
  console.clear();
  console.log(chalk.cyan(figlet.textSync('GRACE', { font: 'Standard' })));
  console.log(chalk.cyan(figlet.textSync('ASSISTANT', { font: 'Standard' })));
  console.log(chalk.gray('━'.repeat(60)));
  console.log(chalk.green.bold(`  🤖 ${BOT_NAME} by ${OWNER_NAME}`));
  console.log(chalk.yellow(`  📅 Date: ${getCurrentDateTime().split(' ')[0]}`));
  console.log(chalk.yellow(`  ⏰ Time: ${getCurrentDateTime().split(' ')[1]} UTC`));
  console.log(chalk.yellow(`  📦 Using: @whiskeysockets/baileys`));
  console.log(chalk.yellow(`  👤 User: ${OWNER_NAME}`));
  console.log(chalk.yellow(`  🔑 Prefix: ${PREFIX}`));
  console.log(chalk.yellow(`  📋 Commands: ${commands.size}`));
  console.log(chalk.gray('━'.repeat(60)));
  console.log('');
}

/* ------------------------------------------------------------------ */
/*  Main Connection Function                                          */
/* ------------------------------------------------------------------ */
async function startGraceAssistant() {
  displayBanner();
  // Setup git configuration
  setupGitConfig();


  let { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(chalk.yellow(`📱 Using WhatsApp Web v${version.join('.')}, isLatest: ${isLatest}`));

  const { state, saveCreds } = await useMultiFileAuthState('./session');
  const msgRetryCounterCache = new NodeCache();

  const conn = makeWASocket({
    version: version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: !pairingCode,
    mobile: useMobile,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(
        state.keys, 
        pino({ level: "fatal" }).child({ level: "fatal" })
      ),
    },
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    msgRetryCounterCache,
    defaultQueryTimeoutMs: undefined,
    
    retryRequestDelayMs: 250,
    maxRetries: 3,
    shouldIgnoreJid: jid => isJidBroadcast(jid),
    
    patchMessageBeforeSending: (message) => {
      const requiresPatch = !!(
        message.buttonsMessage || 
        message.templateMessage || 
        message.listMessage
      );
      if (requiresPatch) {
        message = {
          viewOnceMessage: {
            message: {
              messageContextInfo: {
                deviceListMetadataVersion: 2,
                deviceListMetadata: {}
              },
              ...message
            }
          }
        };
      }
      return message;
    },
    
    transactionOpts: {
      maxCommitRetries: 10,
      delayBetweenRetriesMs: 200
    },
    
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 30000
  });

  /* ------------------------------------------------------------------ */
  /*  Handle Pairing Code                                               */
  /* ------------------------------------------------------------------ */
  if (pairingCode && !conn.authState.creds.registered) {
    if (useMobile) throw new Error('Cannot use pairing code with mobile API');

    let phoneNumberInput = phoneNumber;
    
    phoneNumberInput = phoneNumberInput.trim();
    if (phoneNumberInput.startsWith('+')) {
      phoneNumberInput = phoneNumberInput.substring(1);
    }
    
    try {
      const phoneNumberWithPlus = phoneNumberInput.startsWith('+') ? phoneNumberInput : `+${phoneNumberInput}`;
      const parsedNumber = parsePhoneNumberFromString(phoneNumberWithPlus);
      if (!parsedNumber || !parsedNumber.isValid()) {
        console.log(chalk.red('❌ Invalid phone number in config.js'));
        process.exit(1);
      }
    } catch (err) {
      console.log(chalk.red('❌ Error parsing phone number from config.js'));
      process.exit(1);
    }

    setTimeout(async () => {
      try {
        console.log(chalk.yellow(`\n📲 Requesting pairing code for ${phoneNumberInput}...`));
        let code = await conn.requestPairingCode(phoneNumberInput);
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        
        console.log(chalk.cyan.bold('\n╔════════════════════════════════════╗'));
        console.log(chalk.cyan.bold('║      PAIRING CODE READY            ║'));
        console.log(chalk.cyan.bold('╠════════════════════════════════════╣'));
        console.log(chalk.yellow.bold(`║  Code    : ${code.padEnd(26)}║`));
        console.log(chalk.yellow.bold(`║  Number  : +${phoneNumberInput.padEnd(24)}║`));
        console.log(chalk.cyan.bold('╚════════════════════════════════════╝\n'));
        
        console.log(chalk.white.bold('📱 Enter this code in WhatsApp:'));
        console.log(chalk.white('   1. Open WhatsApp'));
        console.log(chalk.white('   2. Settings > Linked Devices'));
        console.log(chalk.white('   3. Link a Device'));
        console.log(chalk.white('   4. Enter code above\n'));
      } catch (error) {
        console.error(chalk.red('❌ Error requesting pairing code:'), error);
        process.exit(1);
      }
    }, 3000);
  }

  /* ------------------------------------------------------------------ */
  /*  Handle Connection Updates                                         */
  /* ------------------------------------------------------------------ */
  conn.ev.on('creds.update', saveCreds);

  conn.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    
    try {
      if (connection === 'close') {
        let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
        
        if (reason === DisconnectReason.badSession) {
          console.log(chalk.red("❌ Bad Session File, Please Delete Session and Scan Again"));
          startGraceAssistant();
        } else if (reason === DisconnectReason.connectionClosed) {
          console.log(chalk.yellow("⚠️  Connection closed, reconnecting..."));
          startGraceAssistant();
        } else if (reason === DisconnectReason.connectionLost) {
          console.log(chalk.yellow("⚠️  Connection Lost, reconnecting..."));
          startGraceAssistant();
        } else if (reason === DisconnectReason.connectionReplaced) {
          console.log(chalk.red("❌ Connection Replaced"));
          startGraceAssistant();
        } else if (reason === DisconnectReason.loggedOut) {
          console.log(chalk.red("❌ Device Logged Out"));
          startGraceAssistant();
        } else if (reason === DisconnectReason.restartRequired) {
          console.log(chalk.yellow("⚠️  Restart Required, Restarting..."));
          startGraceAssistant();
        } else if (reason === DisconnectReason.timedOut) {
          console.log(chalk.yellow("⚠️  Connection TimedOut, Reconnecting..."));
          startGraceAssistant();
        } else {
          conn.end(`Unknown DisconnectReason: ${reason}|${connection}`);
        }
      }
      
      if (update.connection === "connecting") {
        console.log(chalk.white('🔌 Connecting...'));
      }
      
      if (update.connection === "open") {
        console.log(chalk.green.bold('\n✅ Grace Assistant Connected!'));
        console.log(chalk.green(`📞 User: ${conn.user.name || 'Unknown'}`));
        console.log(chalk.green(`📱 Number: ${conn.user.id.split(':')[0]}`));
        console.log(chalk.green(`🔑 Prefix: ${PREFIX}`));
        console.log(chalk.green(`📋 Commands: ${commands.size}`));
        console.log(chalk.green.bold('🤖 Bot is now online and ready!\n'));
        console.log(chalk.gray('━'.repeat(60)));
          
        displayHandlers();
          
          
        
        // Send welcome message to owner
        const ownerJid = OWNER_NUMBER + '@s.whatsapp.net';
        const currentTime = getCurrentDateTime();
        const welcomeMsg = `╔════════════════════════════╗
║   GRACE ASSISTANT ONLINE   ║
╚════════════════════════════╝

✅ *Bot Successfully Connected!*

📊 *Bot Info:*
• Name: ${BOT_NAME}
• Prefix: ${PREFIX}
• Owner: ${OWNER_NAME}
• Commands: ${commands.size}
• Date: ${currentTime.split(' ')[0]}
• Time: ${currentTime.split(' ')[1]} UTC

🤖 *Status:* Online and Ready
⚡ *Command:* ${PREFIX}menu

${generateFooter()}`;

        try {
          await conn.sendMessage(ownerJid, { text: welcomeMsg });
          console.log(chalk.green('📤 Welcome message sent to owner\n'));
        } catch (err) {
          console.log(chalk.yellow('⚠️  Could not send welcome message'));
        }
      }
    } catch (err) {
      console.error(chalk.red('❌ Connection update error:'), err);
    }
  });

  /* ------------------------------------------------------------------ */
  /*  Handle Messages - DYNAMIC PLUGIN EXECUTION                        */
  /* ------------------------------------------------------------------ */
    /* ------------------------------------------------------------------ */
  /*  Handle Messages - FULLY DYNAMIC PLUGIN EXECUTION                  */
  /* ------------------------------------------------------------------ */
  conn.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      
      if (!msg || !msg.message) return;
        
        
      if (msg.key.fromMe) return;

      
      const sender = msg.key.remoteJid;
        
        
                  // ===== TEMPORARY DEBUG: Log all message types =====
      //  if (sender !== "2348055714323@s.whatsapp.net") return;
   // const messageTypes = Object.keys(msg.message);
   // if (messageTypes.length > 0) {
   //   console.log(chalk.magenta('🔍 DEBUG: Message types:'), messageTypes);
      // Check specifically for viewonce
     // if (messageTypes.some(t => t.toLowerCase().includes('viewonce'))) {
       // console.log(chalk.magenta('🔍 DEBUG: VIEWONCE DETECTED!'));
       // console.log(chalk.magenta('🔍 DEBUG: Full message keys:'), messageTypes);
    //  }
  //  }
    
    // ===== EXECUTE EVENT HANDLERS FIRST (before command processing) =====
    await executeMessageHandlers(conn, msg);
        
        
      const from = sender.split('@')[0];

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        '';

      if (!text) return;

      // Check if message starts with prefix
      if (!text.startsWith(PREFIX)) return;

      const args = text.slice(PREFIX.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();

      console.log(chalk.blue('━'.repeat(60)));
      console.log(chalk.green.bold('📩 New Message'));
      console.log(chalk.cyan(`   From: ${from}`));
      console.log(chalk.white(`   Text: ${text}`));
      console.log(chalk.cyan(`   Command: ${commandName}`));
      console.log(chalk.cyan(`   Args: ${args.join(', ') || 'none'}`));
      console.log(chalk.cyan(`   Time: ${getCurrentDateTime()}`));
      console.log(chalk.blue('━'.repeat(60)));

      // React to message with ⏳
      await reactToMessage(conn, msg, '⏳');

      // FULLY DYNAMIC COMMAND EXECUTION (NO SWITCH-CASE)
      let commandExecuted = false;
      let foundCommand = null;

      // First, try direct command match
      if (commands.has(commandName)) {
        foundCommand = commands.get(commandName);
      } else {
        // Check for aliases
        for (const [cmd, plugin] of commands.entries()) {
          if (plugin.aliases && plugin.aliases.includes(commandName)) {
            foundCommand = plugin;
            break;
          }
        }
      }

      // Execute command if found
      if (foundCommand) {
        try {
          await foundCommand.execute(conn, msg, args, globalContext);
          console.log(chalk.yellow(`   ✅ Executed: ${foundCommand.command}\n`));
          commandExecuted = true;
        } catch (error) {
          console.log(chalk.red(`   ❌ Error executing ${foundCommand.command}: ${error.message}\n`));
          await conn.sendMessage(sender, { 
            text: `❌ *Error executing command*\n\n${error.message}\n\nPlease try again or contact the owner.` 
          });
        }
      } else {
        // Command not found
        console.log(chalk.yellow(`   ⚠️  Unknown command: ${commandName}\n`));
        await conn.sendMessage(sender, { 
          text: `❌ *Unknown command:* \`${commandName}\`\n\nUse *${PREFIX}menu* to see all available commands.` 
        });
      }

      // Remove reaction after configured duration
      setTimeout(async () => {
        await removeReaction(conn, msg);
      }, REACTION_DURATION);

    } catch (e) {
      // Silently ignore decryption errors
      if (e.message && (
        e.message.includes('decrypt') || 
        e.message.includes('MAC') ||
        e.message.includes('internal server error')
      )) {
        return;
      }
      console.error(chalk.red('❌ Message handler error:'), e);
    }
  });

  return conn;
}

/* ------------------------------------------------------------------ */
/*  Graceful Shutdown                                                 */
/* ------------------------------------------------------------------ */
process.on('SIGINT', () => {
  console.log(chalk.yellow.bold('\n\n👋 Shutting down Grace Assistant...'));
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  // Silently ignore
});

/* ------------------------------------------------------------------ */
/*  Start                                                             */
/* ------------------------------------------------------------------ */
startGraceAssistant();