const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

/**
 * fileHandler.js
 * Responsible for parsing quoted messages (all common WhatsApp types)
 * and producing payloads suitable for conn.sendMessage.
 *
 * Exports:
 * - parseQuotedMessage(msg): returns payload object or throws
 * - formatToJid(number): returns whatsapp jid string
 */

/**
 * downloadMedia
 * Downloads media from a quoted message
 */
async function downloadMedia(msg) {
  try {
    // downloadMediaMessage expects the full message object
    const buffer = await downloadMediaMessage(
      msg,
      'buffer',
      {},
      {
        logger: { info() {}, error() {}, warn() {}, trace() {}, debug() {} },
        reuploadRequest: () => {}
      }
    );

    return Buffer.from(buffer);
  } catch (err) {
    throw new Error('Failed to download media: ' + err.message);
  }
}

/**
 * parseQuotedMessage
 * Given the full message object, produce a payload object
 * that can be directly passed to conn.sendMessage(jid, payload).
 *
 * Supported types:
 * - Text (conversation / extendedTextMessage)
 * - Image
 * - Video
 * - Document
 * - Audio
 * - Sticker
 * - ContactMessage (forwards as vcard text)
 * - Location (forwards as location)
 *
 * Returns: payload object
 */
async function parseQuotedMessage(msg) {
  if (!msg) {
    throw new Error('No message object provided');
  }

  if (!msg.message) {
    throw new Error('Message object has no message property');
  }

  // Check if this is a reply/quoted message
  const extendedText = msg.message.extendedTextMessage;
  if (!extendedText || !extendedText.contextInfo || !extendedText.contextInfo.quotedMessage) {
    throw new Error('No quoted message found. Please reply to a message first.');
  }

  const contextInfo = extendedText.contextInfo;
  const quoted = contextInfo.quotedMessage;

  // TEXT - Simple conversation or extended text
  if (quoted.conversation) {
    return { text: quoted.conversation };
  }

  if (quoted.extendedTextMessage) {
    return { text: quoted.extendedTextMessage.text || '' };
  }

  // IMAGE
  if (quoted.imageMessage) {
    try {
      // Create a temporary message object for download
      const tempMsg = {
        key: msg.key,
        message: { imageMessage: quoted.imageMessage }
      };
      
      const buffer = await downloadMedia(tempMsg);
      const caption = quoted.imageMessage.caption || '';
      const mimetype = quoted.imageMessage.mimetype || 'image/jpeg';
      
      return { 
        image: buffer, 
        mimetype, 
        caption 
      };
    } catch (err) {
      throw new Error('Failed to process image: ' + err.message);
    }
  }

  // VIDEO
  if (quoted.videoMessage) {
    try {
      const tempMsg = {
        key: msg.key,
        message: { videoMessage: quoted.videoMessage }
      };
      
      const buffer = await downloadMedia(tempMsg);
      const caption = quoted.videoMessage.caption || '';
      const mimetype = quoted.videoMessage.mimetype || 'video/mp4';
      
      return { 
        video: buffer, 
        mimetype, 
        caption 
      };
    } catch (err) {
      throw new Error('Failed to process video: ' + err.message);
    }
  }

  // DOCUMENT
  if (quoted.documentMessage) {
    try {
      const tempMsg = {
        key: msg.key,
        message: { documentMessage: quoted.documentMessage }
      };
      
      const buffer = await downloadMedia(tempMsg);
      const mimetype = quoted.documentMessage.mimetype || 'application/octet-stream';
      const fileName = quoted.documentMessage.fileName || `document_${Date.now()}`;
      
      return { 
        document: buffer, 
        mimetype, 
        fileName 
      };
    } catch (err) {
      throw new Error('Failed to process document: ' + err.message);
    }
  }

  // AUDIO
  if (quoted.audioMessage) {
    try {
      const tempMsg = {
        key: msg.key,
        message: { audioMessage: quoted.audioMessage }
      };
      
      const buffer = await downloadMedia(tempMsg);
      const mimetype = quoted.audioMessage.mimetype || 'audio/ogg; codecs=opus';
      const ptt = quoted.audioMessage.ptt || false;
      
      return { 
        audio: buffer, 
        mimetype, 
        ptt 
      };
    } catch (err) {
      throw new Error('Failed to process audio: ' + err.message);
    }
  }

  // STICKER
  if (quoted.stickerMessage) {
    try {
      const tempMsg = {
        key: msg.key,
        message: { stickerMessage: quoted.stickerMessage }
      };
      
      const buffer = await downloadMedia(tempMsg);
      
      return { sticker: buffer };
    } catch (err) {
      throw new Error('Failed to process sticker: ' + err.message);
    }
  }

  // CONTACT (vCard)
  if (quoted.contactMessage) {
    try {
      const vcard = quoted.contactMessage.vcard;
      const displayName = quoted.contactMessage.displayName || 'Contact';
      
      if (!vcard) {
        throw new Error('No vCard data found in contact message');
      }

      return {
        contacts: {
          displayName,
          contacts: [{ vcard }]
        }
      };
    } catch (err) {
      throw new Error('Failed to process contact: ' + err.message);
    }
  }

  // CONTACT ARRAY
  if (quoted.contactsArrayMessage) {
    try {
      const contacts = quoted.contactsArrayMessage.contacts || [];
      
      if (contacts.length === 0) {
        throw new Error('No contacts found in contacts array message');
      }

      return {
        contacts: {
          displayName: quoted.contactsArrayMessage.displayName || 'Contacts',
          contacts: contacts.map(c => ({ vcard: c.vcard }))
        }
      };
    } catch (err) {
      throw new Error('Failed to process contacts array: ' + err.message);
    }
  }

  // LOCATION
  if (quoted.locationMessage) {
    const loc = {
      degreesLatitude: quoted.locationMessage.degreesLatitude,
      degreesLongitude: quoted.locationMessage.degreesLongitude
    };

    // Optional fields
    if (quoted.locationMessage.name) loc.name = quoted.locationMessage.name;
    if (quoted.locationMessage.address) loc.address = quoted.locationMessage.address;
    if (quoted.locationMessage.url) loc.url = quoted.locationMessage.url;

    return { location: loc };
  }

  // LIVE LOCATION
  if (quoted.liveLocationMessage) {
    const loc = {
      degreesLatitude: quoted.liveLocationMessage.degreesLatitude,
      degreesLongitude: quoted.liveLocationMessage.degreesLongitude
    };

    if (quoted.liveLocationMessage.caption) loc.caption = quoted.liveLocationMessage.caption;

    return { location: loc };
  }

  // If we reach here, unsupported type
  throw new Error('Unsupported message type. Supported: text, image, video, document, audio, sticker, contact, location');
}

/**
 * formatToJid
 * Basic helper to convert phone number to WhatsApp jid
 */
function formatToJid(number) {
  const cleaned = String(number).replace(/[^\d]/g, '');
  return `${cleaned}@s.whatsapp.net`;
}

module.exports = {
  parseQuotedMessage,
  formatToJid
};