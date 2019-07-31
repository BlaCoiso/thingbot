# ThingBot
This is a Discord bot using the `discord.js` library for node.js. This code is licensed under [GPL v3.0](license.txt). Read [license.txt](license.txt) for the terms and conditions of this license.

## Before starting the bot
Rename `config_example.json` to `config.json`, then modify the config. Check [Config](#Config) for details.  
Run `npm install` to install the dependencies (`discord.js`)

## Running the bot
Run `node bot` to start the bot. All bot messages will be printed to the console and also to the file specified in the config.

## Config
`logFile` (`string`): Specifies the log file. Default value: `bot.log`  
`maxLogLines` (`number`): Maximum number of lines per archived log file before creating a new one. Default value: `250`.  
`disableLog` (`boolean`): If true, logging to file is disabled.  
`useDBConfig` (`boolean`): If true, the config will be read from the database.  
`saveDBConfig` (`boolean`): If true, the config will be saved into the database.  
`database` (`string`): Specifies the database provider.  
`database` (`object`):  
* `provider` (`string`): Specifies the database provider.
* `options` (`object`): Specifies the database options. This is optional and can be omitted when the options are set inside the `database` object.  

`token` (`string`): Discord login token for the bot.  
`reconnectTime` (`number`): Amount of seconds to wait to reconnect after Discord's WebSocket gets closed. Set to `-1` to disable reconnecting or to `0` to try immediately. Default value: `30` seconds.
`prefix` (`string`): Prefix to be used by the bot. Set to `""` to use only mention prefixes. Guilds can still enable normal prefixes. Default value: `""` (no prefix).
`ownerID` (`string|string[]`): ID or array of IDs with owner permission.

## Contributing
### Modules
Check [moduleBase](moduleBase.js) for details on each property, [core module](bot_modules/core.js) for an example implementation and [commandArgs](commandArgs.js) for the command `args` object.
