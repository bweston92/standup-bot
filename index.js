"use strict"; // since I hate not using semicolons

/**
 * Required Imports
 *  - dotenv: .env support
 *  - fs: file system support (for reading ./commands)
 *  - mongoose: mongoDB client
 *  - discord.js: discord (duh)
 *  - schedule: for running the cron jobs
 *  - standup.model: the model for the standup stored in mongo
 */
require("dotenv").config();
const fs = require("fs");
const mongoose = require("mongoose");
const { Client, MessageEmbed, Collection } = require("discord.js");
const schedule = require("node-schedule");
const standupModel = require("./models/standup.model");

const PREFIX = "!";

const IS_DEBUG = process.env["DEBUG"] === "true";
const debug = (msg) => {
  if (IS_DEBUG) {
    console.log('DEBUG: ', msg);
  }
};

const standupIntroMessage = new MessageEmbed()
  .setColor("#ff9900")
  .setTitle("Daily Standup")
  .setDescription("Daily standups! :tada:")
  .addFields(
    {
      name: "Introduction",
      value: `Hi! I will be facilitating your daily standups from now on.\nTo view all available commands, try \`${PREFIX}help\`.`,
    },
    {
      name: "How does this work?",
      value: `Anytime before the standup time \`10:30 AM\`, members would private DM me with the command \`${PREFIX}show\`,`+
      `I will present the standup prompt and they will type their response using a command:\n`+
      `- Overwrite all your reply with: \`${PREFIX}reply [your-message-here]\`\n`+
      `- Append with a new task completed with: \`${PREFIX}task [your-message-here]\`\n`+
      `- Append a new  \`${PREFIX}plan [your-message-here]\`\n`+
      `- Append a follow up needed with: \`${PREFIX}obstacle [your-message-here]\`\n`+
      `I will then save their response in my *secret special chamber of data*, and during the designated standup time, I would present everyone's answer to \`#daily-standups\`.`,
    },
    {
      name: "Getting started",
      value: `*Currently*, there are no members in the standup! To add a member try \`${PREFIX}am <user>\`.`,
    }
  )
  .setTimestamp();

const dailyStandupSummary = new MessageEmbed()
  .setColor("#ff9900")
  .setTitle("Daily Standup")
  .setTimestamp();

const commandFiles = fs
  .readdirSync("./commands")
  .filter((file) => file.endsWith(".js"));

const bot = new Client();
bot.commands = new Collection();

// Imports the command file + adds the command to the bot commands collection
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  bot.commands.set(command.name, command);
}

// mongodb setup with mongoose
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true,
  })
  .catch((e) => console.error(e));

mongoose.connection.once("open", () => console.log("mongoDB connected"));

bot.once("ready", () => console.log("Discord Bot Ready"));

// when a user enters a command
bot.on("message", async (message) => {
  if (message.author.bot) {
    debug("message was sent by bot");
    return;
  }

  if (!message.content.startsWith(PREFIX)) {
    debug(`message did not contain prefix '${PREFIX}' !== '${message.content[0]}'`);
    return;
  }

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  if (!bot.commands.has(commandName)) {
    debug("command is not recognised");
    return;
  }

  if (message.mentions.users.has(bot.user.id)) {
    debug("message mentioned the bot");
    return message.channel.send(":robot:");
  }

  const command = bot.commands.get(commandName);

  if (command.guildOnly && message.channel.type === "dm") {
    return message.channel.send("Hmm, that command cannot be used in a dm!");
  }

  try {
    await command.execute(message, args);
  } catch (error) {
    console.error(error);
    message.channel.send(`Error 8008135: Something went wrong!`);
  }
});

bot.on("guildCreate", async (guild) => {
  // creates the text channel
  debug("attempting to create 'daily-standups'");
  const channel = await guild.channels.create("daily-standups", {
    type: "text",
    topic: "Scrum Standup Meeting Channel",
  });

  // creates the database model
  const newStandup = new standupModel({
    _id: guild.id,
    channelId: channel.id,
    members: [],
    responses: new Map(),
  });

  newStandup
    .save()
    .then(() => console.log("Howdy!"))
    .catch((err) => console.error(err));

    debug("sending intro message");
  await channel.send(standupIntroMessage);
});

// delete the mongodb entry
bot.on("guildDelete", (guild) => {
  standupModel
    .findByIdAndDelete(guild.id)
    .then(() => console.log("Peace!"))
    .catch((err) => console.error(err));
});

function createMissingContent(standup) {
  let missingMembers = [];

  standup.members.forEach(id => {
    if (!standup.responses.has(id)) {
      missingMembers.push(id);
    }
  });

  if (!missingMembers.length) {
    return "Nobody missed the standup: :man_shrugging:";
  }
  
  let missingString = "Whoops, standup was missed by: ";
  missingMembers.forEach(id => (missingString += `<@${id}> `));
  return missingString;
}

function createFieldsFromStandup(standup) {
  const responses = [];

  standup.members.forEach(id => {
    const segments = [];

    let segment = "";
    const replies = standup.responses.get(id).split("\n");

    do {
      let line = replies.shift();

      if (line.length > 350) {
        line = line.substr(0, 350) + '...';
      }

      if (segment.length + line.length > 800) {
        segments.push(segment);
        segment = "";
      }

      segment += line;
    } while (replies.length > 0);

    if (segment.length) {
      segments.push(segment);
    }

    segments.forEach(text => responses.push({name: `-`, value: `<@${id}>\n${text}`}));
    standup.responses.delete(id);
  });

  return responses;
}

let cron = schedule.scheduleJob(
  { hour: 10, minute: 30, dayOfWeek: new schedule.Range(1, 5) },
  (time) => {
    console.log(`[${time}] - CRON JOB START`);
    standupModel
      .find()
      .then((standups) => {
        standups.forEach((standup) => {
          bot.channels.fetch(standup.channelId).then(channel => {
            const msg = new MessageEmbed(dailyStandupSummary);
            msg.setDescription(createMissingContent(standup));
            msg.addFields(createFieldsFromStandup(standup));

            channel.send(msg)
            .then(() => {
              debug("sent daily standup summary")
              standup.save().then(() =>
                console.log(`[${new Date()}] - ${standup._id} RESPONSES CLEARED`)
              )
              .catch((err) => console.error(err));
            }).catch((err) => {
              console.error("unable to send standup", err);
            });
          }).catch(err => {
            console.error(`unable to get channel: ${standup.channelId} - ${err}`)
          })
        });
      })
      .catch((err) => console.error(err));
  }
);

bot.login(process.env.DISCORD_TOKEN);
