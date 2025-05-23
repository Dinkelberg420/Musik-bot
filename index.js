const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');
const ytpl = require('ytpl');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const queue = new Map();

client.once('ready', () => {
  console.log(`✅ Bot ist online als ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim().toLowerCase();
  const serverQueue = queue.get(message.guild.id);

  if (content.startsWith('play')) {
    const args = message.content.split(' ').slice(1);
    const search = args.join(' ');
    if (!search) return message.channel.send('❌ Gib einen Songnamen oder YouTube-Link an.');
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.channel.send('❌ Du musst in einem Sprachkanal sein.');

    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has('Connect') || !permissions.has('Speak'))
      return message.channel.send('❌ Keine Berechtigung zum Betreten oder Sprechen.');

    if (ytpl.validateID(search)) {
      const playlist = await ytpl(search);
      const songs = playlist.items.map(item => ({
        title: item.title,
        url: item.shortUrl,
      }));

      if (!serverQueue) {
        const queueContruct = {
          voiceChannel,
          connection: null,
          songs: [],
          player: null,
          textChannel: message.channel,
        };

        queue.set(message.guild.id, queueContruct);
        queueContruct.songs.push(...songs);

        try {
          const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator,
          });
          queueContruct.connection = connection;
          playSong(message.guild, queueContruct.songs[0]);
          message.channel.send(`▶️ Playlist **${playlist.title}** mit ${songs.length} Songs wird abgespielt.`);
        } catch (err) {
          console.error(err);
          queue.delete(message.guild.id);
          return message.channel.send('❌ Fehler beim Beitreten.');
        }
      } else {
        serverQueue.songs.push(...songs);
        message.channel.send(`➕ Playlist **${playlist.title}** wurde zur Warteschlange hinzugefügt.`);
      }
    } else {
      let song;
      if (ytdl.validateURL(search)) {
        const songInfo = await ytdl.getInfo(search);
        song = { title: songInfo.videoDetails.title, url: songInfo.videoDetails.video_url };
      } else {
        const { videos } = await ytSearch(search);
        if (!videos.length) return message.channel.send('❌ Kein Song gefunden.');
        song = { title: videos[0].title, url: videos[0].url };
      }

      if (!serverQueue) {
        const queueContruct = {
          voiceChannel,
          connection: null,
          songs: [],
          player: null,
          textChannel: message.channel,
        };

        queue.set(message.guild.id, queueContruct);
        queueContruct.songs.push(song);

        try {
          const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator,
          });
          queueContruct.connection = connection;
          playSong(message.guild, queueContruct.songs[0]);
          message.channel.send(`▶️ Starte Wiedergabe: **${song.title}**`);
        } catch (err) {
          console.error(err);
          queue.delete(message.guild.id);
          return message.channel.send('❌ Fehler beim Beitreten.');
        }
      } else {
        serverQueue.songs.push(song);
        message.channel.send(`➕ **${song.title}** wurde zur Warteschlange hinzugefügt.`);
      }
    }
  } else if (content === 'pause') {
    if (!serverQueue) return message.channel.send('⏸️ Keine Musik läuft.');
    serverQueue.player.pause();
    message.channel.send('⏸️ Musik pausiert.');
  } else if (content === 'weiter') {
    if (!serverQueue) return message.channel.send('⏭️ Keine Musik läuft.');
    serverQueue.player.stop();
    message.channel.send('⏭️ Nächster Song.');
  } else if (content === 'queue') {
    if (!serverQueue || serverQueue.songs.length === 0) return message.channel.send('📭 Warteschlange ist leer.');
    const songList = serverQueue.songs.map((s, i) => `${i + 1}. ${s.title}`).join('\n');
    message.channel.send(`📜 Warteschlange:\n${songList}`);
  } else if (content === 'clear') {
    if (!serverQueue) return message.channel.send('❌ Nichts zu löschen.');
    serverQueue.songs = [];
    if (serverQueue.player) serverQueue.player.stop();
    message.channel.send('🗑️ Warteschlange gelöscht.');
  }
});

function playSong(guild, song) {
  const serverQueue = queue.get(guild.id);
  if (!song) {
    if (serverQueue.connection) serverQueue.connection.destroy();
    queue.delete(guild.id);
    return;
  }

  const stream = ytdl(song.url, { filter: 'audioonly', highWaterMark: 1 << 25 });
  const resource = createAudioResource(stream);
  const player = createAudioPlayer();
  serverQueue.player = player;
  player.play(resource);
  serverQueue.connection.subscribe(player);

  player.on(AudioPlayerStatus.Idle, () => {
    serverQueue.songs.shift();
    playSong(guild, serverQueue.songs[0]);
  });

  player.on('error', error => {
    console.error(error);
    serverQueue.songs.shift();
    playSong(guild, serverQueue.songs[0]);
  });

  serverQueue.textChannel.send(`🎶 Jetzt läuft: **${song.title}**`);
}

// ⚠️ HIER DEIN TOKEN EINFÜGEN
client.login('HIER_DEIN_TOKEN');
