import { Client, GatewayIntentBits, Partials, SlashCommandBuilder, REST, Routes, Events } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import express from 'express';

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel]
});

const KEYS_FILE = './keys.json';
let issuedKeys = await fs.readJson(KEYS_FILE).catch(() => ({}));

// Generate random key
const generateKey = () => 'RBX-' + Math.random().toString(36).substring(2, 10).toUpperCase();

// Save keys to file
const saveKeys = async () => fs.writeJson(KEYS_FILE, issuedKeys, { spaces: 2 });

// Slash commands
client.once(Events.ClientReady, async () => {
  console.log(`🟢 Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder().setName('getkey').setDescription('Get your Roblox script key'),
    new SlashCommandBuilder()
      .setName('revoke')
      .setDescription('Revoke a user\'s key')
      .addUserOption(option => option.setName('user').setDescription('User to revoke').setRequired(true)),
    new SlashCommandBuilder()
      .setName('listkeys')
      .setDescription('List all issued keys (Admin)')
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), { body: commands });

  console.log('✅ Slash commands registered');
});

// Handle interactions
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user } = interaction;

  if (commandName === 'getkey') {
    if (issuedKeys[user.id]) {
      return interaction.reply({ content: `🔐 You already have a key: \`${issuedKeys[user.id].key}\``, ephemeral: true });
    }

    const newKey = generateKey();
    const keyData = {
      key: newKey,
      userId: user.id,
      createdAt: Date.now(),
      usageLeft: 1 // limit usage
    };

    issuedKeys[user.id] = keyData;
    await saveKeys();

    try {
      await user.send(`✅ Your Roblox key is: \`${newKey}\``);
      await interaction.reply({ content: '📬 Check your DMs!', ephemeral: true });
    } catch {
      await interaction.reply({ content: '❌ I couldn’t DM you. Enable DMs.', ephemeral: true });
    }
  }

  if (commandName === 'revoke') {
    const target = interaction.options.getUser('user');
    if (issuedKeys[target.id]) {
      delete issuedKeys[target.id];
      await saveKeys();
      return interaction.reply({ content: `❌ Revoked key from <@${target.id}>.` });
    }
    return interaction.reply({ content: `User has no key issued.` });
  }

  if (commandName === 'listkeys') {
    const entries = Object.values(issuedKeys).map(k => `• ${k.key} - <@${k.userId}> - ${k.usageLeft} uses left`).join('\n') || 'No keys issued.';
    await interaction.reply({ content: `**Issued Keys:**\n${entries}`, ephemeral: true });
  }
});

// 🔥 Express server (API)
const app = express();

app.get('/validate', (req, res) => {
  const key = req.query.key;
  if (!key) return res.status(400).send('Missing key');

  const entry = Object.values(issuedKeys).find(k => k.key === key);

  if (!entry) return res.status(403).send('Invalid');

  // Check expiration (24h)
  const expired = Date.now() - entry.createdAt > 24 * 60 * 60 * 1000;
  if (expired) return res.status(403).send('Expired');

  // Check usage
  if (entry.usageLeft <= 0) return res.status(403).send('Used');

  // Valid
  entry.usageLeft -= 1;
  saveKeys();
  return res.send('Valid');
});

app.listen(process.env.PORT, () => {
  console.log(`🌐 API running at http://localhost:${process.env.PORT}`);
});

client.login(process.env.DISCORD_TOKEN);
