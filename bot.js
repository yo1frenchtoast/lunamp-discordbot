#!/usr/bin/env node
/**
 * LunaMP-DiscordBot
 *
 * yo1frenchtoast <Yoan TANGUY> - Aug 2025
 *
 */


const { createLogger, format, transports } = require('winston');
const Discord = require('discord.js');
const net     = require('net');
const shell   = require('shelljs');
// Configuration files
const auth    = require('./auth.json');
const hosts   = require('./hosts.json');
const admins  = require('./admins.json');

// Configure logger
const logger = createLogger({
    format: format.combine(
        format.colorize(),
        format.timestamp(),
        format.printf(log => `${log.timestamp} [${log.level}]: ${log.message}`)
    ),
    transports: [
        new transports.Console({
            level: 'debug'
        }),
        new transports.File({
            level: 'info',
            filename: 'bot.log'
        })
    ]
});

// Initialize Discord Bot
const bot = new Discord.Client();

// 'Ready' handler
bot.on('ready', () => {
    logger.info('Connected to Discord');
    logger.info('Logged in as: ' + bot.user.tag);
});

// 'TypingStart' handler
bot.on('typingStart', (channel, user) => {
    logger.debug(user.username + ' is typing in ' + channel.name + '...');
});

// 'Message' handler
bot.on('message', async msg => {
    // ignore non-command messages
    if (msg.content.substring(0,1) != '!') {
        return;
    }

    var author = msg.author.username;

    logger.info('Received: \'' + msg.content + '\' from ' + author);

    var args = msg.content.split(' ');
    var cmd = args[0];

    var reply = await handleCommand(cmd, args, author);
    logger.info('Replying: ' + reply);
    msg.channel.send(reply);
});

// 'Error' handler
bot.on('error', error => {
    logger.error(error);
});

// Bot client authentication
bot.login(auth.token);

/**
 * OBJECTS
 */

class Server {
    constructor (address, port) {
        this.address = address;
        this.port = port;
    }

    infos () {
        return new Promise((resolve, reject) => {
            const socket = new net.Socket();
            let rawData = '';

            socket.connect(this.port, this.address, () => {
                socket.write(
                    `GET / HTTP/1.1\r\nHost: ${this.address}:${this.port}\r\nConnection: close\r\n\r\n`
                );
            });

            socket.on('data', chunk => {
                rawData += chunk.toString();
            });

            socket.on('close', () => {
                // Handle servers that send bare \n instead of \r\n (HPE_CR_EXPECTED)
                const sep = rawData.includes('\r\n\r\n') ? '\r\n\r\n' : '\n\n';
                const bodyStart = rawData.indexOf(sep);
                if (bodyStart === -1) {
                    return reject(new Error('Invalid HTTP response: no header/body separator found'));
                }
                const body = rawData.slice(bodyStart + sep.length).trim();
                try {
                    const parsed = JSON.parse(body);
                    resolve(Array.isArray(parsed) ? parsed[0] : parsed);
                } catch (e) {
                    reject(new Error('Failed to parse server response as JSON: ' + e.message));
                }
            });

            socket.on('error', err => {
                reject(new Error(`Connection to ${this.address}:${this.port} failed: ${err.message}`));
            });

            socket.setTimeout(5000, () => {
                socket.destroy();
                reject(new Error(`Connection to ${this.address}:${this.port} timed out`));
            });
        });
    }
}

/**
 * FUNCTIONS
 */

async function handleCommand(cmd, args, author) {
    // !help
    if (cmd === '!help') {
        return(`***Available commands:***\`\`\`
- !help   => print this help
- !ping   => should respond 'Pong!' if alive
- !server => give informations about LunaMP server\`\`\``);
    }

    // !ping
    if (cmd === '!ping') {
        return('Pong!');
    }

    // !server
    if (cmd === '!server') {
        return await handleServerCommand(args, author);
    }

    return('Unknown command, type !help for more informations');
}

async function handleServerCommand(args, author) {
    // !server help
    if (!args[1] || args[1] === 'help') {
        return (`**Hello** @${author} !
***Available commands:***\`\`\`
- !server help      => print this help
- !server print     => print infos about all servers
- !server dump <id> => dump all informations about specified server
- !server players   => list players currently on servers\`\`\``);
    }

    // Get infos from each http servers
    var servers = [];
    for (var host of hosts) {
        var server = new Server(host.address, host.port);
        try {
            var infos = await server.infos();
            servers.push(infos);
        } catch (err) {
            logger.error('Failed to fetch infos from ' + host.address + ':' + host.port + ' — ' + err.message);
            servers.push(null);
        }
    }

    // !server print
    if (args[1] === 'print') {
        var message = '***Available servers:***\n';
        // Iterate on infos
        for (var i = 0; i < servers.length; i++) {
            logger.debug(JSON.stringify(servers[i]));
            message += `\`\`\`${i} > Server name: ${servers[i].GeneralSettings.ServerName}
- Server port: ${hosts[i].port}\n\`\`\``;
        }
        return message;
    }

    // !server dump
    if (args[1] === 'dump') {
        if (!args[2] || !servers[args[2]]) {
            return(`Please specify a valid server ID. Use !server print to list servers.`);
        }
        const s = servers[args[2]];
        const gs = s.GeneralSettings;
        const cs = s.CurrentState;
        const vessels = cs.CurrentVessels || [];
        const vesselTypes = vessels.reduce((acc, v) => {
            acc[v.Type] = (acc[v.Type] || 0) + 1;
            return acc;
        }, {});
        const vesselSummary = Object.entries(vesselTypes).map(([t, n]) => `${n}x ${t}`).join(', ') || 'none';
        const startTime = new Date(cs.StartTime).toUTCString();
        const memMB = (cs.BytesUsed / 1024 / 1024).toFixed(1);

        return `\`\`\`
=== ${gs.ServerName} ===
Description : ${gs.Description}
Game mode   : ${gs.GameMode} (${gs.GameDifficulty})
Max players : ${gs.MaxPlayers}
Password    : ${gs.HasPassword ? 'Yes' : 'No'}
Cheats      : ${gs.Cheats ? 'Enabled' : 'Disabled'}
Port        : ${gs.ConsoleIdentifier} / ${s.ServerConnectionSettings.Port}
Terrain     : ${gs.TerrainQuality}

--- Current state ---
Server start : ${startTime}
Players      : ${cs.CurrentPlayers.length} / ${gs.MaxPlayers}
Vessels      : ${vessels.length} total (${vesselSummary})
Memory used  : ${memMB} MB
Warp mode    : ${s.WarpSettings.WarpMode}
\`\`\``;
    }

    // !server players
    if (args[1] === 'players') {
        var message = '';
        for (var i = 0; i < servers.length; i++) {
            var server_name = servers[i].server_name;
            var players = servers[i].players;
            var player_count = servers[i].player_count;
            var max_players = servers[i].max_players;
            var lastPlayerActivity = new Date(servers[i].lastPlayerActivity * 1000).toISOString().substr(11, 8);
            message += `*Currently **${player_count}/${max_players}** players connected to server* ${server_name}
    *- Last activity:* ${lastPlayerActivity} ago
    *- Players list:* ${players.toString()}\n`;
        }
        return message;
    }

    // !server admin
    if (args[1] === 'admin') {
        // only autorize admins
        if (!admins.includes(author)) {
            return('You are not authorized to run this command.');
        }

        // !server admin help
        if (args[2] === 'help') {
            return(`***Available commands:***\`\`\`
- !server admin help         => print this help
- !server admin restart <id> => restart specified server\`\`\``);
    //*- !server admin say <id> <message>*    => send message to all players on specified server`
        }

        // !server admin restart
        if (args[2] === 'restart') {
            var container_name = hosts[args[3]].container_name;

            logger.info('Going to restart container ' + container_name);

            shell.exec(`docker restart ${container_name}`);
            return(`Container '${container_name}' restarted.`);
        }

        return ('Unknown command, type !server admin help for more informations');
    }

    return('Unknown command, type !server help for more informations');
}
