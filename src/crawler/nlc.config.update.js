/*
 * Licensed Materials - Property of IBM
 * (C) Copyright IBM Corp. 2016. All Rights Reserved.
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const yargs = require('yargs');
const appRoot = require('app-root-path');

const configPath = path.resolve(appRoot.toString(), 'data', 'services-data.json');
const DEFAULT_KEYWORD_THRESHOLD = 70;
const DEFAULT_CONCEPT_THRESHOLD = 70;

var argv = yargs
    .usage('Usage: $0 --keyword_thresh [number] --concept_thresh [number]')
    .help()
    .option('keyword_thresh', { alias: 'kt', describe: `Keyword threshold. (${DEFAULT_KEYWORD_THRESHOLD})`})
    .option('concept_thresh', { alias: 'ct', describe: `Concept relevance threshold. (${DEFAULT_CONCEPT_THRESHOLD})`})
    .argv;

var config;
var existingServices = [];

// Check if config file exists
try {
  config = require(configPath);
  if (argv.keyword_thresh) {
    config.keyword_relevance_threshold = argv.keyword_thresh;
  }
  if (argv.concept_thresh) {
    config.concept_relevance_threshold = argv.concept_thresh;
  }
  if (config.nlc_class_info.length > 0) {
    existingServices = config.nlc_class_info.map((nlcClass) => {
      return nlcClass.class_name;
    });
  }
} catch (e) {
  config = {
    keyword_relevance_threshold: argv.keyword_thresh || DEFAULT_KEYWORD_THRESHOLD,
    concept_relevance_threshold: argv.concept_thresh || DEFAULT_CONCEPT_THRESHOLD,
    nlc_class_info: []
  };
}

const cf = require('hubot-cf-convenience').promise.then((result) => {
  var servicesNotIncluded = [];
  var blacklistNotIncluded = [];
  var removedServices = [];
  var allServices = {};

  var newServices = result.serviceCache.filter(function(service) {
    allServices[service.display_name] = service;
    if (service.display_name && service.doc_url) {
      if(Array.isArray(config.blacklist) && config.blacklist.indexOf(service.display_name) > -1) {
        blacklistNotIncluded.push(service);
        return false;
      } else if (existingServices.indexOf(service.display_name) < 0) {
        return true;
      } else {
        return false;
      }
    } else {
      servicesNotIncluded.push(service);
      return false;
    }
  }).map((service) => {
    // Removes IBM in the front of string
    var docName = service.display_name;
    if (docName.substring(0, 3) === 'IBM') {
      docName = docName.replace('IBM', '').trim();
    }
    // Removes any content in parenthesis
    var parenth = /\(([^)]+)\)/.exec(docName);
    if (parenth !== null) {
      docName = docName.replace(parenth[0], '').trim();
    }
    // Create abbreviation and add to doc_name
    var abbrev = docName.match(/\b([A-Z])/g);
    if (abbrev && abbrev.length >= 3) {
      docName = docName.trim() + ', ' + abbrev.join('');
    }

    const item = {
      class_name: service.display_name,
      doc_name: docName,
      doc_link: service.doc_url
    }
    return item;
  });

  config.nlc_class_info = config.nlc_class_info.concat(newServices);

  // Remove services from config that are no longer on Bluemix
  for (var i = 0; i < config.nlc_class_info.length; i++) {
    if (!allServices[config.nlc_class_info[i].class_name]) {
      removedServices.push(config.nlc_class_info[i].class_name);
      config.nlc_class_info.splice(i, 1);
      i--;
    }
  }

  fs.writeFile(configPath, JSON.stringify(config, null, 2), (err) => {
    if (err) {
      throw err;
    }
    console.log('-----------------------------------------------');
    console.log('Not included because missing documentation URL:');
    console.log('-----------------------------------------------');
    for (var j = 0; j < servicesNotIncluded.length; j++) {
      console.log(servicesNotIncluded[j].label);
    }
    console.log('-----------------------------------------------');
    console.log('Not included because on blacklist:');
    console.log('-----------------------------------------------');
    for (var j = 0; j < blacklistNotIncluded.length; j++) {
      console.log(blacklistNotIncluded[j].label);
    }
    console.log('-----------------------------------------------');
    console.log('Removed because no longer exists on Bluemix:');
    console.log('-----------------------------------------------');
    for (var j = 0; j < removedServices.length; j++) {
      console.log(removedServices[j]);
    }
    console.log('-----------------------------------------------');
    console.log('New services added:');
    console.log('-----------------------------------------------');
    for (var j = 0; j < newServices.length; j++) {
      console.log(newServices[j].class_name);
    }
    process.exit();
  });

  // cf unused error causing lint to fail
  cf.Logs;
});
