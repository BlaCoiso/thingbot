//jshint esversion:6
const BaseModule = require("../moduleBase");
class CoreModule extends BaseModule {
    constructor() {
        super();
        this.name = "Core";
        this.description = "Bot's core module";
        this.events = ["command", "ready"];
        this.commands = [
            {
                name: "help",
                description: "Gives the help message",
                sendDM: true,
                run(msg, args) {
                    let helpMessage = "List of commands: \n";
                    let commands = args.moduleLoader.getCommands();
                    if (commands && commands.length !== 0) {
                        for (let command of commands) {
                            helpMessage += ` \`${command.name.toLowerCase()}\`: ${command.description}\n`;
                        }
                    }
                    if (!args.isDM) args.output({ text: "Help was sent to DMs.", sendDM: false });
                    return helpMessage;
                }
            },
            {
                name: "reload",
                description: "Reloads all modules",
                reply: true,
                run(msg, args) {
                    if (this.module.config.ownerID) {
                        if (msg.author.id === this.module.config.ownerID) {
                            //TODO: Better way of checking if the user can do this
                            //TODO: Reload specified module instead of all of them
                            args.moduleLoader.reload();
                            return "Reloaded all modules.";
                        }
                    } else return { reply: false, text: "This command is not available" };
                }
            }
        ];
    }
    handle(event, client, ...args) {
        if (event === "ready") {
            client.user.setPresence({ game: { name: `@${client.user.username} help` } });
        }
    }
}

module.exports = new CoreModule();