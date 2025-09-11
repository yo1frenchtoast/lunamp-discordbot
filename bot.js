#!/usr/bin/env node
/**
 * LunaMP-DiscordBot
 *
 * yo1frenchtoast <Yoan TANGUY> - Aug 2025
 *
 */


const { createLogger, format, transports } = require('winston');
const Discord = require('discord.js');
const request = require('then-request');
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
bot.on('message', msg => {
    // ignore non-command messages
    if (msg.content.substring(0,1) != '!') {
        return;
    }

    var author = msg.author.username;

    logger.info('Received: \'' + msg.content + '\' from ' + author);

    var args = msg.content.split(' ');
    var cmd = args[0];

    var reply = handleCommand(cmd, args, author);
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

function Server(address, port) {
    this.address = address;
    this.port = port;

    this._url = 'http://'+address+':'+port+'/';
    this._getInfos = function () { 
        request('GET', this._url).done(function (res) {
            let body = res.getBody();
            logger.debug('Received: '+body);
            this.infos = JSON.parse(body);
        });
    }
    this._getInfos();
}

/**
 * FUNCTIONS
 */

function handleCommand(cmd, args, author) {
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
        return handleServerCommand(args, author);
    }

    return('Unknown command, type !help for more informations');
}

function handleServerCommand(args, author) {
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
    for (var server of hosts) {
        servers.push(new Server(server.address, server.port).infos);
    }

    // !server print
    if (args[1] === 'print') {
        var message = '***Available servers:***\n';
        // Iterate on infos
        for (var i = 0; i < servers.length; i++) {
            logger.debug(JSON.stringify(servers[i]));
            message.concat(`\`\`\`${i} > Server name: ${servers[i].GeneralSettings.ServerName}
- Server port: ${hosts[i].port}\n\`\`\``);
        }
        return message;
    }

    // !server dump
    if (args[1] === 'dump') {
        return(JSON.stringify(servers[args[2]], null, 4));
    }

    // !server players
    if (args[1] === 'players') {
        var message = '';
        for (var i = 0; i < infos.length; i++) {
            var server_name = infos[i].server_name;
            var players = infos[i].players;
            var player_count = infos[i].player_count;
            var max_players = infos[i].max_players;
            var lastPlayerActivity = new Date(servers[i].lastPlayerActivity * 1000).toISOString().substr(11, 8);
            message.concat(`*Currently **${player_count}/${max_players}** players connected to server* ${server_name}
    *- Last activity:* ${lastPlayerActivity} ago
    *- Players list:* ${players.toString()}\n`);
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