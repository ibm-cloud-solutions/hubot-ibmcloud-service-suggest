// Description:
//	Listens for commands to initiate Bluemix service suggestions
//
// Configuration:
// HUBOT_WATSON_NLC_URL= <API URL for Watson Natural Language Classifier>
// HUBOT_WATSON_NLC_USERNAME= <User Id for Watson Natural Language Classifier>
// HUBOT_WATSON_NLC_PASSWORD= <Password for Watson Natural Language Classifier>
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
const palette = require('hubot-ibmcloud-utils').palette;
const env = require('../lib/env.js');
const activity = require('hubot-ibmcloud-activity-emitter');
const servicesDataPath = (process.env.SUGGEST_TEST) ? '../../test/resources' : '../../data';
const servicesData = require(path.join(servicesDataPath, 'services-data.json'));

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

const SERVICE_SUGGEST_LIST = /suggest (show|list)$/i;

function listServices(robot, res, location){
  if (!env.isNlcConfigured) {
    robot.logger.error(`${TAG}: Unable to list b/c NLC is not properly configured.`);
    let message = i18n.__('suggest.nlc.not.configured');
    robot.emit('ibmcloud.formatter', {response: res, message: message});
    return;
  }
  else{
    robot.logger.info(`${TAG}: Listing services bot is trained to suggest...`);
    activity.emitBotActivity(robot, res, { activity_id: 'activity.suggest.list'});

    const attachments = servicesData.nlc_class_info.map((serviceData) => {
      const attachment = {
        title: serviceData.class_name,
        color: palette.normal
      };
      attachment.fields = [
        {title: i18n.__('suggest.service.field.url'), value: serviceData.doc_link}
      ];
      return attachment;
    });

    if (attachments.length === 0) {
      robot.logger.info(`${TAG}: No services to list.`);
      let message = i18n.__('suggest.list.no.services');
      robot.emit('ibmcloud.formatter', {response: res, message: message});
    }
    else {
      robot.logger.info(`${TAG}: Listing ${attachments.length} applications.`);
      let message = i18n.__('suggest.list.services');
      robot.emit('ibmcloud.formatter', {response: res, message: message});
      robot.emit('ibmcloud.formatter', {
        response: res,
        attachments
      });
    }
  }
}

module.exports = (robot) => {
  robot.on('bluemix.suggest.list', (res, parameters) => {
    robot.logger.debug(`${TAG} bluemix.suggest.list - Natural Language match.`);
    listServices(robot, res, parameters.location);
  });
  robot.respond(SERVICE_SUGGEST_LIST, {id: 'bluemix.suggest.list'}, function(res) {
    robot.logger.debug(`${TAG} bluemix.suggest.list - RegEx match.`);
    listServices(robot, res, res.match[1]);
  });
};
