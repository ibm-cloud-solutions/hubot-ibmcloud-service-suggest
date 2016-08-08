/*
 * Licensed Materials - Property of IBM
 * (C) Copyright IBM Corp. 2016. All Rights Reserved.
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
 */
'use strict';

const path = require('path'),
  fs = require('fs'),
  stringify = require('csv-stringify');

const appRoot = require('app-root-path'),
  logger = require('winston'),
  watson = require('watson-developer-cloud'),
  yargs = require('yargs'),
  _ = require('lodash'),
  hashes = require('hashes'),
  humanizeDuration = require('humanize-duration');

const cache_alchemyOutput = new hashes.HashTable(); // in-memory cache of all data returned from AlchemyAPIs.
const cache_stats = {
  hits: 0,
  misses: 0
};

// will be set to appropriate module based on crawler_type argument.
var crawler_impl;

var runId = 'gen_run_' + (Math.floor(Math.random() * 10000) + 1);
var runStartTime = new Date();
var config_file_path = path.resolve(appRoot.toString(), 'data', 'services-data.json');
var config_obj = {};
var class_data_objs = []; // In memory store of data gathered for each class.
var temp_class_data_objs = []; // Temp array of recently processed classes.
var temp_output_count = 0;
const deprecation_watch_list = []; // Potentially deprecated services.
const DEPRECATE_SEARCH_STRING = 'deprecat';
var output_dir = 'output';
var processing_class_count;
var processing_class_total;

// Total number of AlchemyAPI "transactions" that happen during a crawl.
var totalTransactionsCount = 0;

logger.info('run start time: ' + runStartTime);
logger.info('run ID: ' + runId);

var argv = yargs
    .usage('Usage: $0 --apikey [string] --config [string] --log_lvl [string] --doc_limit [number]')
    .help()
    .option('apikey', { alias: 'key', default: '<REPLACE_WITH_YOUR_AlchemyAPI_KEY>', describe: 'AlchemyAPI key.  Can be multiple keys separated by commas.' })
    .option('config', { alias: 'conf', describe: 'Config file path/name'})
    .option('log_lvl', { alias:'log', describe: 'Log level to be used by crawler'})
    .option('doc_limit', { alias:'limit', describe: 'Limit how many documents we process for a given class'})
    .option('crawler_type', { alias:'type', default: 'dynamic', describe: 'Type of crawl.  valid values: static or dynamic(default)'})
    .option('exclude_keywords', { default: false, describe: 'do not contribute keywords to training data'})
    .option('exclude_concepts', { default: false, describe: 'do not contribute concepts to training data'})
    .option('exclude_relations', { default: false, describe: 'do not contribute relations to training data'})
    .option('exclude_one_word', { default: false, describe: 'do not contribute one word entries to training data'})
    .option('no_alchemy', {default: false, describe: 'prevents generator from calling alchemy'})
    .option('alchemy_input_file', {describe: 'a generator.output.json file from previous crawler run'})
    .option('output_freq', { default: 5, describe: 'how often to write partial output. helpful for big crawls.' })
    .argv;

if(argv.crawler_type === 'dynamic') {
  logger.info('preparing to perform dynamic crawl...');
  crawler_impl = require('./crawler_dynamic');
}
else if(argv.crawler_type === 'static') {
  logger.info('preparing to perform static crawl...');
  crawler_impl = require('./crawler_static');
} else {
  logger.error(`unrecognized crawl type: ${argv.crawler_type}.  Valid types: static and dynamic`);
  process.exit(8);
}

if(argv.log_lvl) {
  process.env.LOG_LVL = argv.log_lvl;
}

if(process.env.LOG_LVL) {
  logger.level = process.env.LOG_LVL;
} else {
  logger.level = 'info';
}

// using an array for alchemy_lang objects, as a work around for api limits.  The user can pass in a comma separated list
// of keys and well use multiple instances of the alchemy_language functions.  Each with different keys.
const alchemy_lang_array = [];
var alchemy_lang_index = 0;

argv.apikey.split(',').forEach((key)=>{
  alchemy_lang_array.push(watson.alchemy_language({
    api_key: key
  }));
});

logger.info(`Using ${alchemy_lang_array.length} keys for Alchemy APIs.`);

// will cycle through all instances of alchemy_language functions.
var getAlchemyLangAPI = function() {
  if(alchemy_lang_array.length === 1) {
    return alchemy_lang_array[0];
  }

  let retVal = alchemy_lang_array[alchemy_lang_index];
  alchemy_lang_index++;
  if(alchemy_lang_index === alchemy_lang_array.length) {
    alchemy_lang_index = 0;
  }

  return retVal;
}

if(argv.config) {
  // override default crawler config file.
  config_file_path = argv.config;
}

// Loads the config file and sets defaults for all know config params.
if(!fs.existsSync(config_file_path)) {
  logger.error('Unable to resolve config file: ' + config_file_path);
  process.exit(1);
} else {
  logger.info('Reading config file: ' + config_file_path);

  try{
    var configFile = fs.readFileSync(config_file_path);
    config_obj = JSON.parse(configFile);
  } catch(error) {
    logger.error('Unable to load config file.  error: ' + error);
    process.exit(2);
  }
}

if(!Array.isArray(config_obj.nlc_class_info) || !config_obj.nlc_class_info.length) {
  logger.error('config file must contain nlc_class_info array of class name and links.');
  process.exit(3);
} else {
  processing_class_count = 0;
  processing_class_total = config_obj.nlc_class_info.length;
}

// Defaults for all known config options.
if(isNaN(config_obj.keyword_relevance_threshold)) {
  config_obj.keyword_relevance_threshold = 50;
}
logger.info('config parm: keyword_relevance_threshold = ' + config_obj.keyword_relevance_threshold);

if(isNaN(config_obj.concept_relevance_threshold)) {
  config_obj.concept_relevance_threshold = 50;
}
logger.info('config parm: concept_relevance_threshold = ' + config_obj.concept_relevance_threshold);

if(typeof config_obj.relations_require_service_name !== 'boolean') {
  config_obj.relations_require_service_name = true;
}
logger.info('config parm: relations_require_service_name = ' + config_obj.relations_require_service_name);

// **** If you are reading me, go to the bottom of this file and work your way back up ;)

// removes any ASCII chars between 128-191 (special chars/symbols not used in words)
var stripSpecial = function(str) {
  if(!str) {
    return str;
  }

  return str.replace(/[^\x00-\x7F\xC0-\xFF]+/g, '');
}

// true if string1 contains string2, ignores case and special ASCII chars.
var containsIgnoreCase = function(string1, string2) {
  if(!string1 || !string2) {
    return false;
  }

  string1 = stripSpecial(string1).toLowerCase();
  string2 = stripSpecial(string2).toLowerCase();

  return (string1.indexOf(string2) > -1);
}

// true if the provided string contains at least 1 of the names the doc calls this class.
// NOTE: doc name can be a comma separated list of strings
var containsClassDocName = function(string, class_data_obj) {
  if(!class_data_obj.doc_name || !class_data_obj.doc_name.length) {
    logger.error('detected class data object, without doc_name.  class: ' + class_data_obj.class_name);
    return false;
  }

  let doc_name_array = class_data_obj.doc_name.split(',');
  doc_name_array = doc_name_array.map((e)=>{
    return e.trim();
  });

  for(let i = 0; i < doc_name_array.length; ++i) {
    if(containsIgnoreCase(string, doc_name_array[i])) {
      return true;
    }
  }

  return false;
}

var getFromCache = function (url) {
  var hashEntry = cache_alchemyOutput.get(url);
  var alchemy_output;

  if (hashEntry && hashEntry.value) {
    alchemy_output = hashEntry.value;
    cache_stats.hits++;
  } else {
    cache_stats.misses++;
  }

  return alchemy_output;
}

var addToCache = function (url, alchemy_output) {
  cache_alchemyOutput.add(url, alchemy_output);
}

var exportToCsv = function (export_data_objs, append) {
  logger.info('exporting to csv...');

  return new Promise((resolve, reject) => {
    var csvNlcData = [];
    for (var i in export_data_objs) {
      var classification = export_data_objs[i];
      classification.class_text.map(function (statement) {
        csvNlcData.push([statement, classification.class_name]);
      });
    }
    stringify(csvNlcData, function (err, output) {
      if (err) {
        reject(err);
      } else {
        var csv_output_file_path = output_dir + path.sep  +  'nlcTrainingData.csv';

        if(append) {
          fs.appendFile(csv_output_file_path, output, function (appendError) {
            if (appendError) {
              reject(appendError);
            } else {
              logger.info('successfully appended to csv file: ' + csv_output_file_path);
              resolve();
            }
          });
        } else {
          fs.writeFile(csv_output_file_path, output, function (writeError) {
            if (writeError) {
              reject(writeError);
            } else {
              logger.info('successfully exported to csv file: ' + csv_output_file_path);
              resolve();
            }
          });
        }
      }
    });
  });
}

// support option to periodically write the most recently processed class data to output directory.
var capturePartialOutput = function (class_data_obj, flush) {
  if (!argv.output_freq) {
    return Promise.resolve();
  }

  try {
    let doWrite = false;

    if(class_data_obj) {
      temp_class_data_objs.push(class_data_obj);
      doWrite = temp_class_data_objs.length === argv.output_freq;
    } else if(flush === true && temp_class_data_objs.length) {
      doWrite = true;
    }

    if (doWrite) {
      let write_class_data_objects = temp_class_data_objs;
      temp_class_data_objs = [];

      if (!fs.existsSync(output_dir)) {
        fs.mkdirSync(output_dir);
      }

      var output_file_path = output_dir + path.sep + runId + '_part.' + (temp_output_count++) + '.json';
      logger.info('Saving partial generator JSON output file: ' + output_file_path);
      fs.writeFileSync(output_file_path, JSON.stringify(write_class_data_objects, null, 2), 'utf-8');

      return exportToCsv(write_class_data_objects, true);
    } else {
      return Promise.resolve();
    }
  } catch (error) {
    logger.error('error while capturing temp output.  error: ' + error);
    temp_class_data_objs = [];
    argv.output_freq = 0; // disable feature.
    return Promise.reject(error);
  }
}

// Include all keywords above the configured threshold.
var contributeKeywords = function(page_data_object, class_data_obj) {
  if(!argv.exclude_keywords && page_data_object.alchemy_output.keywords) {
    for(let i = 0; i < page_data_object.alchemy_output.keywords.length; ++i) {
      let keyword = page_data_object.alchemy_output.keywords[i];

      if(keyword.relevance < (config_obj.keyword_relevance_threshold/100)) {
        return;
      }

      class_data_obj.processed_keywords.push(stripSpecial(keyword.text).trim());
    }
  }
}

// Include all concepts above the configured threshold.
var contributeConcepts = function(page_data_object, class_data_obj) {
  if(!argv.exclude_concepts && page_data_object.alchemy_output.concepts) {
    for(let i = 0; i < page_data_object.alchemy_output.concepts.length; ++i) {
      let concept = page_data_object.alchemy_output.concepts[i];

      if(concept.relevance < (config_obj.concept_relevance_threshold/100)) {
        return;
      }
      class_data_obj.processed_concepts.push(stripSpecial(concept.text).trim());
    }
  }
}

// Include threshold sentences if they contain the class name.
var contributeRelations = function(page_data_object, class_data_obj) {
  if(!argv.exclude_relations && page_data_object.alchemy_output.relations) {
    for(let i = 0; i < page_data_object.alchemy_output.relations.length; ++i) {
      let relation = page_data_object.alchemy_output.relations[i];

      if(containsClassDocName(relation.sentence, class_data_obj)) {
        class_data_obj.processed_relations.push(stripSpecial(relation.sentence).trim());
      }
    }
  }
}

// combines all the process alchemy data into class_text, which is later used for generating the NLC training data file.
var contributeClassText = function(class_data_obj, classElement) {
  // If the classElement from service-data config has additional statements it wants to include for this class.
  let additionalManualData = classElement && Array.isArray(classElement.additional_class_text) ?  classElement.additional_class_text : [];
  if(additionalManualData.length) {
    logger.info(`including manual training data for class: ${classElement.class_name}`);
  }

  class_data_obj.class_text = _.concat(class_data_obj.processed_keywords, class_data_obj.processed_concepts, class_data_obj.processed_relations, additionalManualData);
  class_data_obj.class_text = _.uniq(class_data_obj.class_text);

  // Additional filtering
  class_data_obj.class_text = class_data_obj.class_text.filter((element)=>{

    // Filter out text that is only a #
    if(!isNaN(element)) {
      return false;
    }

    // Optionally filter out one word training data
    if(argv.exclude_one_word && element.split(/\s+/).length < 2) {
      return false;
    }

    // Filter out training data that exceeds the limit imposed by NLC service.
    if(element.length > 1024) {
      logger.warn('omitting training data entry that exceeds max phrase length of 1024');
      logger.debug('omitted phrase: ' + element);
      return false;
    }

    return true;
  });

  if(!class_data_obj.class_text.length) {
    logger.info(`**** Detected class with no training data: ${class_data_obj.class_name} ****`);
  } else {
    // check to see if this service maybe deprecated and add to watch list.
    for(let i = 0; i < class_data_obj.class_text.length; ++i) {
      let text = class_data_obj.class_text[i];
      if(containsIgnoreCase(text, DEPRECATE_SEARCH_STRING)) {
        logger.warn(`detected potentially deprecated service: ${classElement.class_name}`);
        deprecation_watch_list.push(classElement.class_name);
        break;
      }
    }
  }
}

// Used data returned from AlchemyAPIs to determine if a page is talking about the class.
var isPageRelevant = function(page_data_object, class_data_obj) {

  // If keyword above relevance threshold contains class name.
  if(page_data_object.alchemy_output.keywords) {
    for(let i = 0; i < page_data_object.alchemy_output.keywords.length; ++i) {
      let keyword = page_data_object.alchemy_output.keywords[i];

      if(keyword.relevance < (config_obj.keyword_relevance_threshold/100)) {
        break;
      }

      if(containsClassDocName(keyword.text, class_data_obj)) {
        logger.debug(`determined page is relevant based on keyword: ${keyword.text} class: ${class_data_obj.class_name}...`);
        logger.debug(`  page: ${page_data_object.url}`);
        return true;
      }
    }
  }

  // If concept above relevance threshold contains class name.
  if(page_data_object.alchemy_output.concepts) {
    for(let i = 0; i < page_data_object.alchemy_output.concepts.length; ++i) {
      let concept = page_data_object.alchemy_output.concepts[i];

      if(concept.relevance < (config_obj.concept_relevance_threshold/100)) {
        break;
      }

      if(containsClassDocName(concept.text, class_data_obj)) {
        logger.debug(`determined page is relevant based on concept: ${concept.text} class: ${class_data_obj.class_name}...`);
        logger.debug(`  page: ${page_data_object.url}`);
        return true;
      }
    }
  }

  // If relation sentence contains class name.
  if(page_data_object.alchemy_output.relations) {
    for(let i = 0; i < page_data_object.alchemy_output.relations.length; ++i) {
      let relation = page_data_object.alchemy_output.relations[i];

      if(containsClassDocName(relation.sentence, class_data_obj)) {
        logger.debug(`determined page is relevant based on relation.  class: ${class_data_obj.class_name}...`);
        logger.debug(`  page: ${page_data_object.url}`);
        logger.debug(`  relation: ${relation.sentence}`);
        return true;
      }
    }
  }

  logger.debug(`determined page is not relevant.  class: ${class_data_obj.class_name}...`);
  logger.debug(`  page: ${page_data_object.url}`);
  return false;
}

// Use Watson APIs to retrieve data for the provided page.  If the pageData contains text, then invoke AlchemyAPI
// with it's text, else invoke AlchemyAPI using the pages url.
var retrieveRawAlchemyData = function(page_data_object) {
  if(argv.no_alchemy) {
    return Promise.resolve({});
  }

  var cachedAlchemyOutput = getFromCache(page_data_object.url);
  if(cachedAlchemyOutput) {
    return Promise.resolve(cachedAlchemyOutput);
  }

  return new Promise((resolve, reject) => {
    var params = {
      extract: 'keywords,concepts,relations'
    };

    if(page_data_object.pageData.text) {
      params.text = page_data_object.pageData.text;
    }
    else {
      params.url = page_data_object.url;
    }

    getAlchemyLangAPI().combined(params, function (err, response) {
      if (err) {
        reject(err);
      }
      else {
        // AlchemyAPI response will indicate how many transactions took place during an API call.
        totalTransactionsCount += isNaN(response.totalTransactions) ? 0 : parseInt(response.totalTransactions);

        addToCache(page_data_object.url, response);
        resolve(response);
      }
    });
  });
}

// Promise will always be resolved.  Even if error happens while gather data for a given document, the processing of the class
// should continue.
var processClassDocument = function(pageData, class_data_obj) {
  return new Promise((resolve, reject_not_used) => {
    // call keyword service and call concept service.  put the returned data into alchemy_output.
    var page_data_object = {
      url: pageData.url,
      pageData: pageData,
      isRelevant: true,
      alchemy_output: {}
    };

    retrieveRawAlchemyData(page_data_object).then((alchemy_output) => {
      page_data_object.alchemy_output = alchemy_output;
      class_data_obj.raw_data.push(page_data_object);
    }).then(() => {
      page_data_object.isRelevant = isPageRelevant(page_data_object, class_data_obj);

      if(page_data_object.isRelevant) {
        contributeKeywords(page_data_object, class_data_obj);
        contributeConcepts(page_data_object, class_data_obj);
        contributeRelations(page_data_object, class_data_obj);
      }
    }).catch((error) => {
      logger.error(`unable to retrieve/process data from watson for class: ${class_data_obj.class_name}, page url: ${page_data_object.url}, error: ${JSON.stringify(error)}`);
    }).then(() => {
      resolve(); // will always run.
    });
  });
};

// Starting with the root doc of a class, use the configured crawler implementation to discover related documents.
var getAllPageDataForClass = function(classElement) {
  return crawler_impl.crawl(classElement.doc_link);
}

// processes a single element of the nlc_class_info array.
var processClassElement = function(classElement) {
  return new Promise((resolve, reject) => {
    // validate class name and link.
    if(!classElement.class_name || !classElement.class_name.length) {
      reject('element does not contain a valid class_name attribute. element: ' + JSON.stringify(classElement));
    } else if(!classElement.doc_link || !classElement.doc_link.length) {
      reject('element does not contain a valid doc_link attribute. element: ' + JSON.stringify(classElement));
    } else {
      logger.info(`processing class (${++processing_class_count} of ${processing_class_total}): ${classElement.class_name} ... - run elapsed time: ${humanizeDuration(new Date().getTime() - runStartTime.getTime())} `);

      // Start by creating a data object for this class element.  Then gather data for each related doc.
      var class_data_obj = {
        class_name: classElement.class_name,
        doc_name: classElement.doc_name || classElement.class_name,
        class_text: [], // This is the input for NLC.  It's a combination of the below 'processed' fields with no duplicates.
        processed_keywords: [],
        processed_concepts: [],
        processed_relations: [],
        raw_data: []
      };

      if(classElement.class_text) {
        // this class has been manually trained, so just use the training data from service-data file.
        try {
          logger.info(`using manual training data for class: ${classElement.class_name}`);
          class_data_obj.class_text = classElement.class_text;

          if(!argv.output_freq) {
            // only needed if we aren't capturing partial output as classes are processed.
            class_data_objs.push(class_data_obj);
          }

          capturePartialOutput(class_data_obj).then(() => {
            resolve();
          }).catch((error) => {
            reject(error);
          });
        } catch(error) {
          reject(error);
        }
      } else {
        getAllPageDataForClass(classElement).then((all_pageData) => {
          if(!all_pageData || !all_pageData.length) {
            reject('no documents detected for class element: ' + JSON.stringify(classElement));
          } else {
            logger.info(`processing ${all_pageData.length} documents for class: ${classElement.class_name}`);

            // limit how many docs we process for each class element.  For test purposes only.
            if(argv.doc_limit && all_pageData.length > argv.doc_limit) {
              logger.info(`\tEnforcing doc limit of ${argv.doc_limit} per class.`);
              all_pageData = all_pageData.slice(0, argv.doc_limit);
            }

            if(!argv.output_freq) {
              // only needed if we aren't capturing partial output as classes are processed.
              class_data_objs.push(class_data_obj);
            }

            var docPromises = [];
            all_pageData.forEach((pageData) => {
              docPromises.push(processClassDocument(pageData, class_data_obj));
            });

            Promise.all(docPromises).then(() => {
              // All docs for this class element have been processed.  Now contribute the NLC text for this class
              // and capture incremental output if enabled.
              contributeClassText(class_data_obj, classElement);
              return capturePartialOutput(class_data_obj);
            }).then(() => {
              // This class element has been completely processed.
              logger.info(`Alchemy cache stats.  size: ${cache_alchemyOutput.count()} hits: ${cache_stats.hits} misses: ${cache_stats.misses}`);
              resolve();
            }).catch((error)=> {
              reject(error);
            });
          }
        }).catch((error)=> {
          reject(error);
        });
      }
    }
  });
}

// creates a promise chain that will cause each element to be processed in serial.  the chain will continue
// even if we fail during processing of a single class.
var processAllClasses = function () {
  var p = Promise.resolve();

  config_obj.nlc_class_info.forEach((classElement) => {
    var onFulfilled = function () {
      return processClassElement(classElement);
    };

    var onRejected = function (error) {
      logger.error(error);

      // promise chain continues even if processing of 1 element fails.
      return processClassElement(classElement);
    }

    p = p.then(onFulfilled, onRejected);
  });

  return p;
}

// This method is used for testing only.  Allows us to reprocess previously retrieved AlchemyAPI data via the
// generator.output.json created during a previous run.  This is good for testing tweaks the the generated training data
// without crawling or hitting the AlchemyAPIs.
var loadAndProcessAlchemyInputFile = function(alchemy_input_file) {
  return new Promise((resolve, reject) => {
    if(!fs.existsSync(alchemy_input_file)) {
      reject('alchemy_input_file does not exist: ' + alchemy_input_file);
    } else {
      logger.info('Reading alchemy_input_file: ' + alchemy_input_file);

      try{
        var inputFile = fs.readFileSync(alchemy_input_file);
        class_data_objs = JSON.parse(inputFile);

        class_data_objs.forEach((class_data_obj)=>{
          // start by clearing out all the processed data.
          class_data_obj.class_text = [];
          class_data_obj.processed_keywords = [];
          class_data_obj.processed_concepts = [];
          class_data_obj.processed_relations = [];

          class_data_obj.raw_data.forEach((page_data_object)=>{
            // now reprocess each page we have data for.
            page_data_object.isRelevant = isPageRelevant(page_data_object, class_data_obj);

            if(page_data_object.isRelevant) {
              contributeKeywords(page_data_object, class_data_obj);
              contributeConcepts(page_data_object, class_data_obj);
              contributeRelations(page_data_object, class_data_obj);
            }
          });

          contributeClassText(class_data_obj);
        });

        resolve();
      } catch(error) {
        reject('error processing alchemy_input_file.  error: ' + error);
      }
    }
  });
}

crawler_impl.initialize().then(()=>{
  if(argv.alchemy_input_file) {
    return loadAndProcessAlchemyInputFile(argv.alchemy_input_file);
  } else {
    // typical path
    return processAllClasses();
  }
}).then(()=> {
  logger.info(`AlchemyAPI transaction count: ${totalTransactionsCount}.  For more info see:`);
  argv.apikey.split(',').forEach((key)=>{
    logger.info(`http://access.alchemyapi.com/calls/info/GetAPIKeyInfo?apikey=${key}`);
  });
  logger.info('...');
}).then(()=> {
  if(!argv.output_freq) {
    // save all gathered/processed data to a file.
    if (!fs.existsSync(output_dir)){
      fs.mkdirSync(output_dir);
    }

    var json_output_file_path = output_dir + path.sep  + 'generator.output.json';
    logger.info('Saving generator JSON output to file: ' + json_output_file_path);
    fs.writeFileSync(json_output_file_path, JSON.stringify(class_data_objs, null, 2) , 'utf-8');
  } else {
    return capturePartialOutput(null, true);
  }
}).then(()=> {
  if(!argv.output_freq) {
    return exportToCsv(class_data_objs);
  }
}).then(()=> {
  if(deprecation_watch_list.length) {
    logger.info(`List of potentially deprecated services: ${JSON.stringify(deprecation_watch_list)}`);
    fs.writeFileSync(output_dir + path.sep  + 'deprecation_watch_list.json', JSON.stringify(deprecation_watch_list, null, 2) , 'utf-8');
  }
}).then(()=> {
  let crawler_to_release = crawler_impl;
  crawler_impl = null;
  return crawler_to_release.release();
}).then(()=> {
  logger.info(`NLC data generation is complete.  - total elapsed time: ${humanizeDuration(new Date().getTime() - runStartTime.getTime())}`);
}).catch((error)=> {
  logger.error(error);

  if (crawler_impl) {
    // if we never made it to release, then release here and wait before existing.
    try {
      crawler_impl.release();
    }
    catch (err) {
      console.error(err);
    }

    setTimeout(function () {
      process.exit(11);
    }, 5000);
  }
  else {
    process.exit(12);
  }
});
