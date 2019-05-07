#!/usr/bin/env node
/**
 * LunaMP-DiscordBot
 *
 * yo1frenchtoast <Yoan TANGUY> - Aug 2025
 *
 */

const Discord   = require('discord.js');
const { createLogger, format, transports } = require('winston');
const request   = require('sync-request');
const shell     = require('shelljs');
const auth      = require('./auth.json');
const hosts     = require('./hosts.json');
const admins    = require('./admins.json');

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

    logger.info('Received: \'' + msg.content + '\' from ' + msg.author.username);

    var args = msg.content.split(' ');
    var cmd = args[0];

    // !help
    if (cmd === '!help') {
        msg.channel.send(`Available commands:
    *- !help*       => print this help
    *- !ping*       => should respond 'Pong!' if alive
    *- !server*     => give informations about LunaMP server`
        );
    }
    // !ping
    else if (cmd === '!ping') {
        msg.channel.send('Pong!');
    }
    // !server
    else if (cmd === '!server') {
        // Get infos from each http servers
        var infos = [];
        for (var server of hosts) {
            infos.push(new Server(server.address, server.port).infos);
        }

        // !server help
        if (!args[1] || args[1] === 'help') {
            msg.channel.send(`**Hello** @${msg.author.username} !
***Available commands:***
    *- !server help*        => print this help
    *- !server print*       => print infos about all servers
    *- !server dump <id>*   => dump all informations about specified server
    *- !server players*     => list players currently on servers`
            );
        }
        // !server print
        else if (args[1] === 'print') {
            msg.channel.send('***Available servers:***');
            // Iterate on infos
            for (var i = 0; i < infos.length; i++) {
                msg.channel.send(`*${i} > Server name:* ${infos[i].server_name}
    *- Server port:* ${infos[i].port}
    *- Current server version:* ${infos[i].version}`
                );
            }
        }
        // !server dump
        else if (args[1] === 'dump') {
            msg.channel.send(JSON.stringify(infos[args[2]], null, 4));
        }
        // !server players
        else if (args[1] === 'players') {
            for (var i = 0; i < infos.length; i++) {
            var server_name         = infos[i].server_name;
            var players             = infos[i].players;
            var player_count        = infos[i].player_count;
            var max_players         = infos[i].max_players;
            var lastPlayerActivity  = new Date(infos[i].lastPlayerActivity * 1000).toISOString().substr(11,8);

            msg.channel.send(`*Currently **${player_count}/${max_players}** players connected to server* ${server_name}
    *- Last activity:* ${lastPlayerActivity} ago
    *- Players list:* ${players.toString()}`
                );
            }
        }
        // !server admin
        else if (args[1] === 'admin') {
            // only autorize admins
            if (!admins.includes(msg.author.username)) {
                msg.channel.send('You are not authorized to run this command.');
            }

            // !server admin help
            if (args[2] === 'help') {
                msg.channel.send(`***Available commands:***
    *- !server admin help*                  => print this help
    *- !server admin restart <id>*          => restart specified server`
    //*- !server admin say <id> <message>*    => send message to all players on specified server`
                );
            }
            // !server admin restart
            else if (args[2] === 'restart') {
                var container_name = hosts[args[3]].container_name;

                logger.info('Going to restart container ' + container_name);

                shell.exec(`docker restart ${container_name}`);
                msg.channel.send(`Container '${container_name}' restarted.`);
            }
            //else if (args[2] === 'say') {
            //    var screen_name = hosts[args[3]].screen_name;
            //    var message     = args.slice(4).join(' ');
            //    shell.exec(`screen -S ${screen_name} -p 0 -X stuff "/say DarkMP-DiscordBot: ${message}^M"`);
            //    msg.channel.send(`Message '${message}' broadcasted on server '${screen_name}'.`);
            //}
            else {
                msg.channel.send('Unknown command, type !server admin help for more informations');
            }
        }
        else {
            msg.channel.send('Unknown command, type !server help for more informations');
        }
    }
    else {
        msg.channel.send('Unknown command, type !help for more informations');
    }
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

    this._url = 'http://' + address + ':' + port + '/';
    this._getInfos = function() {
        var res = request('GET', this._url);
        var body = res.getBody('utf8');
        logger.debug('Received: ' + body);
        this.infos = JSON.parse(body);
    }
    this._getInfos();
}

/**
 * FUNCTIONS
 */
