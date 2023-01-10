const standupModel = require("../models/standup.model");

function updateStandupWithMessage(standup, message, memo) {
    let response = standup.responses.get(message.author.id) || "";
    
    response += `\nI faced an obstacle: ${memo}`;
    
    standup.responses.set(message.author.id, response.trim());

    return standup.save();
}

function standupSuccessHandler(message) {
    return () => {
        message.channel.send("Updated Response :tada:");
    }
}

function standupFailHandler(message) {
    return (err) => {
        console.error(err);
        message.channel.send("Oh no :scream:! An error occured somewhere in the matrix!");
    }
}

module.exports = {
  name: "obstacle",
  usage: "[your-message-here]",
  description: "Add a obstacle to your reply prompt",
  execute(message, args) {
    if (message.channel.type !== "dm") {
        return message.reply("private DM me with `!obstacle` :bomb:");
    }

    if (!args.length || (args.length == 1 && args[0].startsWith("@"))) {
        return message.reply("Ruh Roh! You must provide a response as a message. No one likes a :ghost: as a team member :exclamation: :anger:");
    }

    const memo = args.join(" ");

    if (args[0].startsWith("@")) {
        standupModel
            .findById(args[0].slice(1))
            .then(standup => {
                if (standup.members.indexOf(message.author.id) !== -1) {
                    message.channel.send("Ruh Roh! You must be a team member in this server standup to reply to the response!");
                    return;
                }

                updateStandupWithMessage(standup, message, memo.substr(args[0].length))
                    .then(standupSuccessHandler(message))
                    .catch(standupFailHandler(message));
            })
            .catch(err => {
                console.error(err);
                message.channel.send("Oh no :scream:! An error occured somewhere in the matrix!");
            });
    } else {
        standupModel
            .find()
            .then(allStandups => {
                const standups = allStandups.filter(standup => standup.members.indexOf(message.author.id) !== -1);

                if (0 === standups.length) {
                    message.channel.send("Ruh Roh! You must be a team member in ***__any__*** server standup to reply to the response!");
                    return
                }

                if (standups.length > 1) {
                    message.channel.send("Ruh Roh! Looks like you're a member in multiple standup servers!\nTry `!obstacle @<serverId> [your-message-here]` if you would like to reply to a *specific* standup server.\n**_Crunchy Hint:_** To get the serverId for *any* server, right-click the server icon and press `Copy ID`.\nNote that you may need Developer options turned on. But like, what kinda developer uses a standup bot **_AND DOESN'T TURN ON DEVELOPPER SETTINGS_** :man_facepalming:");
                }

                updateStandupWithMessage(standups[0], message, memo)
                    .then(standupSuccessHandler(message))
                    .catch(standupFailHandler(message));
            })
            .catch(err => {
                console.error(err);
                message.channel.send("Oh no :scream:! An error occured somewhere in the matrix!");
            });
    }
  },
};
