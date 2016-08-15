/*
 * Licensed Materials - Property of IBM
 * (C) Copyright IBM Corp. 2016. All Rights Reserved.
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
 */
'use strict';

var isNlcConfigured = true;
const nlc = {
  url: process.env.VCAP_SERVICES_NATURAL_LANGUAGE_CLASSIFIER_0_CREDENTIALS_URL || process.env.HUBOT_WATSON_NLC_URL,
  username: process.env.VCAP_SERVICES_NATURAL_LANGUAGE_CLASSIFIER_0_CREDENTIALS_USERNAME || process.env.HUBOT_WATSON_NLC_USERNAME,
  password: process.env.VCAP_SERVICES_NATURAL_LANGUAGE_CLASSIFIER_0_CREDENTIALS_PASSWORD || process.env.HUBOT_WATSON_NLC_PASSWORD,
  prefix: process.env.HUBOT_WATSON_NLC_SUGGEST_PREFIX
};

if (!nlc.url) {
  console.error('HUBOT_WATSON_NLC_URL not set');
  isNlcConfigured = false;
}
if (!nlc.username) {
  console.error('HUBOT_WATSON_NLC_USERNAME not set');
  isNlcConfigured = false;
}
if (!nlc.password) {
  console.error('HUBOT_WATSON_NLC_PASSWORD not set');
  isNlcConfigured = false;
}

module.exports = {
  isNlcConfigured: isNlcConfigured,
  nlc: nlc
};
