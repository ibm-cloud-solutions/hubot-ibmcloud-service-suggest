// Description:
//	Listens for commands to initiate Bluemix service suggestions
//
// Configuration:
// HUBOT_WATSON_NLC_URL= <API URL for Watson Natural Language Classifier>
// HUBOT_WATSON_NLC_USERNAME= <User Id for Watson Natural Language Classifier>
// HUBOT_WATSON_NLC_PASSWORD= <Password for Watson Natural Language Classifier>
//
// Commands:
//   hubot suggest help - Show available commands relating to service suggestions
//
/*
 * Licensed Materials - Property of IBM
 * (C) Copyright IBM Corp. 2016. All Rights Reserved.
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
 */
'use strict';

var path = require('path');
var TAG = path.basename(__filename);

// --------------------------------------------------------------
// i18n (internationalization)
// It will read from a peer messages.json file.  Later, these
// messages can be referenced throughout the module.
// --------------------------------------------------------------
var i18n = new (require('i18n-2'))({
  locales: ['en'],
  extension: '.json',
  // Add more languages to the list of locales when the files are created.
  directory: path.join(__dirname, '../messages'),
  defaultLocale: 'en',
  // Prevent messages file from being overwritten in error conditions (like poor JSON).
  updateFiles: false
});
// At some point we need to toggle this setting based on some user input.
i18n.setLocale('en');

const SERVICE_SUGGEST_HELP = /(suggest)\s+help/i;

function showHelp(robot, res){
  robot.logger.info(`${TAG}: Listing help for service suggest...`);

  let help = robot.name + ' ' + i18n.__('help.suggest.list') + '\n';
  help += robot.name + ' ' + i18n.__('help.suggest.service') + '\n';
  help += i18n.__('help.suggest.examples.header') + '\n';
  help += '	' + i18n.__('help.suggest.example1') + '\n';
  help += '	' + i18n.__('help.suggest.example2') + '\n';
  help += '	' + i18n.__('help.suggest.example3') + '\n';

  robot.emit('ibmcloud.formatter', {response: res, message: '\n' + help});
};

module.exports = (robot) => {

  robot.on('bluemix.suggest.help', (res, parameters) => {
    robot.logger.debug(`${TAG}: bluemix.suggest.help - Natural Language match.`);
    showHelp(robot, res);
  });

  robot.respond(SERVICE_SUGGEST_HELP, function (res) {
    robot.logger.debug(`${TAG} bluemix.suggest.help - RegEx match.`);
    showHelp(robot, res);
  });
};
