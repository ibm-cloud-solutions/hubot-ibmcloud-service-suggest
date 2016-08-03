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

const fs = require('fs');
const path = require('path');
const TAG = path.basename(__filename);
const NLCManager = require('hubot-ibmcloud-cognitive-lib').nlcManager;
const palette = require('hubot-ibmcloud-utils').palette;
const activity = require('hubot-ibmcloud-activity-emitter');
const env = require('../lib/env.js');
const servicesDataPath = (process.env.SUGGEST_TEST) ? '../../test/resources' : '../../data';
const servicesData = require(path.join(servicesDataPath, 'services-data.json'));

const _ = require('lodash');

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

// randomize response text
const REPLIES = [
  i18n.__('suggest.reply.0'),
  i18n.__('suggest.reply.1'),
  i18n.__('suggest.reply.2'),
  i18n.__('suggest.reply.3')];

const SERVICE_SUGGEST = /suggest(\s|\sa\s|\ssome\s)(service|services)\s(.*)$/i;

// Processes the json object received from NLC.
// Returns the response to be shown to the user.
function processResponse(robot, data) {
  const matchingServicesData = [];
  const MAX_MATCHES = 3;

  var nClasses = data.classes && data.classes.length ? data.classes.length : 0;
  if (nClasses < 1) {
    return matchingServicesData;
  }

  // Find the top X classes.  They are in descending order.
  for (let i = 0; i < nClasses && matchingServicesData.length < MAX_MATCHES; i++) {
    let nlcClassName = data.classes[i].class_name;
    let serviceData = _.find(servicesData.nlc_class_info, {class_name: nlcClassName});

    if (serviceData) {
      matchingServicesData.push(serviceData);
    } else {
      robot.logger.error(`${TAG}: NLC returned class_name that is not in service data.  class_name: ${nlcClassName}`);
    }
  }

  return matchingServicesData;
}

// Finds the training data .csv file in the data folder and returns an object with useful info.
function getTrainingDataInfo(robot) {
  var trainingDataInfo;

  try {
    let files = fs.readdirSync(path.resolve(__dirname, '../../data'));
    for(let i in files) {
      let matches = files[i].match(/hubot-service-suggest-v(\d+)\.csv/);
      if(matches) {
        trainingDataInfo = {
          path: path.resolve(__dirname, '../../data', matches[0]),
          version: matches[1],
          classifierName: matches[0].substring(0, matches[0].length - '.csv'.length)
        };
        break;
      }
    }

    if(!trainingDataInfo) {
      robot.logger.error(`${TAG}: Unable to find hubot-service-suggest .csv training data file.`);
    } else {
      robot.logger.debug(`${TAG}: Resolved info about training data.  trainingDataInfo: ${JSON.stringify(trainingDataInfo)}`);
    }
  }
  catch(err) {
    robot.logger.error(`${TAG}: error while resolving info about training data file.  err:`);
    robot.logger.error(err);
  }

  return trainingDataInfo;
}

function suggestServices(robot, res, description, nlcManager){

  const text = description.trim();
  robot.logger.debug(`${TAG}: service suggest classify text: ${text}`);

  nlcManager.classify(text).then((response) => {
    robot.logger.debug(`${TAG}: classifier response: ${JSON.stringify(response)}`);
    try {
      if(!response.classes && response.status) {
        // classifier is not ready to use.  classify() has returned the classifier itself.
        robot.logger.info(`${TAG}: User asked for a service suggestion, but NLC is still training.`);
        let message = i18n.__('suggest.classifer.training');
        robot.emit('ibmcloud.formatter', {response: res, message: message});
      } else {
        const matches = processResponse(robot, response);
        activity.emitBotActivity(robot, res, { activity_id: 'activity.suggest.services'});

        const attachments = matches.map((serviceData) => {
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
          robot.logger.info(`${TAG}: No services returned from NLC to suggest.`);
          let message = i18n.__('suggest.no.matches');
          robot.emit('ibmcloud.formatter', {response: res, message: message});
        }
        else {
          robot.logger.info(`${TAG}: Suggesting ${attachments.length} services matching users needs.`);
          let message = REPLIES[(Math.floor(Math.random() * REPLIES.length))];
          robot.emit('ibmcloud.formatter', {response: res, message: message});
          robot.emit('ibmcloud.formatter', {
            response: res,
            attachments
          });
        }
      }
    } catch (error) {
      robot.logger.error(`${TAG}: Error processing NLC response.  error:`);
      robot.logger.error(error);
      if (error.dumpstack) {
        robot.logger.error(error.dumpstack);
      }

      let message = i18n.__('suggest.nlc.internal.error');
      robot.emit('ibmcloud.formatter', {response: res, message: message});
    }
  }).catch((err) => {
    robot.logger.error(`${TAG}: Error while invoking classify on NLC service.  err:`);
    robot.logger.error(err);
    let message = i18n.__('suggest.nlc.error');
    robot.emit('ibmcloud.formatter', {response: res, message: message});
  });
}


module.exports = (robot) => {

  // Setup NLC data and initiate training if needed.
  var nlcOptions, nlcManager;
  var trainingDataInfo = getTrainingDataInfo(robot);

  if(env.isNlcConfigured && trainingDataInfo) {
    nlcOptions = {
      url: env.nlc.url,
      username: env.nlc.username,
      password: env.nlc.password,
      classifierName: trainingDataInfo.classifierName,
      training_data: fs.createReadStream(trainingDataInfo.path),
      version: 'v1'
    };
    nlcManager = new NLCManager(nlcOptions);

    robot.logger.info(`${TAG}: checking status of NLC training for service suggest.`);
    nlcManager.trainIfNeeded().then((classifier)=>{
      robot.logger.debug(`${TAG}: classifier for NLC service suggest: ${JSON.stringify(classifier)}`);

      if(classifier.status === 'Available') {
        robot.logger.info(`${TAG}: service suggest classifier is available.`);
      }
      else if(classifier.status === 'Training') {
        robot.logger.info(`${TAG}: service suggest classifier is training.`);
        nlcManager.monitorTraining(classifier.classifier_id).then(()=>{
          robot.logger.info(`${TAG}: service suggest classifier has completed training and is now available.`);
        }).catch((error)=>{
          robot.logger.error(`${TAG}: error while monitoring training of NLC service suggest. error:`);
          robot.logger.error(error);
        });
      }
      else {
        robot.logger.error(`${TAG}: error NLC classifier for service suggest has unexpected status.  status: ${classifier.status}`);
      }
    }).catch((err)=>{
      robot.logger.error(`${TAG}: error initiating training of NLC service suggest. err:`);
      robot.logger.error(err);
      nlcManager = null; // don't try to use manager we couldn't properly initialize.
    });
  }

  robot.on('bluemix.suggest.service', (res, parameters) => {
    robot.logger.debug(`${TAG}: bluemix.suggest.service - Natural Language match.`);
    suggestServices(robot, res, res.message.text, nlcManager);
  });

  // Setup commands implement by this script.
  robot.respond(SERVICE_SUGGEST, function (res) {
    if (!env.isNlcConfigured || !nlcManager) {
      robot.logger.info(`${TAG}: Unable to suggest services b/c NLC is not properly configured.`);
      let message = i18n.__('suggest.nlc.not.configured');
      robot.emit('ibmcloud.formatter', {response: res, message: message});
      return;
    } else{
      robot.logger.debug(`${TAG}: bluemix.suggest.service - RegEx match.`);
      suggestServices(robot, res, res.match[3], nlcManager);
    }
  });
};
