/*
 * Licensed Materials - Property of IBM
 * (C) Copyright IBM Corp. 2016. All Rights Reserved.
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
 */
'use strict';

const path = require('path'),
  fs = require('fs');

const appRoot = require('app-root-path'),
  async = require('async'),
  dotenv = require('dotenv'),
  watson = require('watson-developer-cloud'),
  parse = require('csv-parse'),
  yargs = require('yargs'),
  num_converter = require('number-to-words'),
  _ = require('lodash');

var argv = yargs
    .usage('Usage: $0 --threshold [number] --limit [number] --verbose [boolean]')
    .help()
    .option('threshold', { default: 90, describe: 'confidence threshold to be considered a match' })
    .option('limit', { default: 0, describe: 'limit # of calls to NLC service'})
    .option('classifier_id', {describe: 'overrides NLC classifier_id in test env file'})
    .option('verbose', { default: false, describe: 'print verbose output'})
    .option('test_env', { describe: 'overrides default location of test env file'})
    .option('test_data', { describe: 'overrides default location of test data file'})
    .option('suggestion_count', { default: 1, describe: 'how many suggestions we return'})
    .argv;

const NLC_BASE_URL = 'https://gateway.watsonplatform.net/natural-language-classifier/api';

var test_env_path = argv.test_env || appRoot + path.sep + 'test' + path.sep + 'crawler' + path.sep + 'test.env';
var test_data_path = argv.test_data || appRoot + path.sep + 'test' + path.sep + 'crawler' + path.sep + 'test-data.csv';

var test_data_array = []; // will hold array of arrays, one element for each row in data file.
var test_result = {
  errors: 0,
  correct: 0,
  incorrect: 0,
  incorrect_no_top_class: 0,
  incorrect_threshold: 0,
  incorrect_wrong_class: 0,
  total: 0
};

// tracks which index in the classify results a match is found at
var match_index_array = [];
for(let i = 0; i < argv.suggestion_count; ++i) {
  match_index_array.push(0);
}

if (!fs.existsSync(test_env_path)) {
  console.error('ERROR: you need to create a test.env file with these variables set for your NLC classifier: HUBOT_WATSON_NLC_USERNAME, HUBOT_WATSON_NLC_PASSWORD and HUBOT_WATSON_NLC_CLASSIFIER');
  console.error('ERROR: the test env file should be at this location: ' + test_env_path);
  process.exit(1);
} else {
  dotenv.config({path: test_env_path});
  if(!process.env.HUBOT_WATSON_NLC_USERNAME) {
    console.error('ERROR: missing required env: HUBOT_WATSON_NLC_USERNAME');
    process.exit(1);
  }
  else if(!process.env.HUBOT_WATSON_NLC_PASSWORD) {
    console.error('ERROR: missing required env: HUBOT_WATSON_NLC_PASSWORD');
    process.exit(1);
  }
  else if(!argv.classifier_id && !process.env.HUBOT_WATSON_NLC_CLASSIFIER) {
    console.error('ERROR: missing required env: HUBOT_WATSON_NLC_CLASSIFIER');
    process.exit(1);
  }
}

const nlc = watson.natural_language_classifier({
  url: NLC_BASE_URL,
  username: process.env.HUBOT_WATSON_NLC_USERNAME,
  password: process.env.HUBOT_WATSON_NLC_PASSWORD,
  version: 'v1'
});
var classifier_status = {};

if (!fs.existsSync(test_data_path)) {
  console.error('ERROR: unable to locate test data file, expected path: ' + test_data_path);
  process.exit(1);
}

var readAndParseTestData = function() {
  return new Promise((resolve, reject) => {
    try{
      var test_data = fs.readFileSync(test_data_path);
      parse(test_data, {comment: '#'}, function(err, output){
        if(err) {
          reject(err);
        } else {
          test_data_array = output;
          resolve();
        }
      });
    } catch(error) {
      reject(error);
    }
  });
}

var retrieveClassifierStatus = function() {
  return new Promise((resolve, reject) => {
    try{
      nlc.status({
        classifier_id: argv.classifier_id || process.env.HUBOT_WATSON_NLC_CLASSIFIER},
          function(err, response) {
            if (err) {
              reject(err);
            }
            else {
              classifier_status = response;
              resolve()
            }
          });
    } catch(error) {
      reject(error);
    }
  });
}

// NOTE: error for calls to NLC wouldn't result in rejected promise.  Instead, test_results.errors will be incremented.
var classifyAndCompare = function() {
  return new Promise((resolve, reject) => {
    try{
      async.eachLimit(test_data_array, 10, function(element, callback) {
        test_result.total++;
        let test_text = element[0];
        let test_class = element[1];

        nlc.classify({
          text: test_text,
          classifier_id: argv.classifier_id || process.env.HUBOT_WATSON_NLC_CLASSIFIER},
            function(err, response) {
              if (err) {
                console.log('ERROR: during NLC classify request.  error: ', err);
                test_result.errors++;
              }
              else {
                if(argv.verbose) {
                  console.log(JSON.stringify(response, null, 2));
                }

                // classes above the threshold, no more than suggestion_count.
                let top_classes = [];
                let match = false;
                let threshold_not_met = false;

                if(response.classes && response.classes.length) {
                  for(let i = 0; i < response.classes.length && top_classes.length < argv.suggestion_count; ++i) {
                    if((response.classes[i].confidence * 100) >= argv.threshold) {
                      top_classes.push(response.classes[i]);
                    } else {
                      // classes in response are sorted in descending order, so exit loop once threshold is to small
                      break;
                    }
                  }

                  if(!top_classes.length) {
                    threshold_not_met = true;
                    test_result.incorrect_threshold++;
                  } else {
                    // see if we have a match
                    let matchIndex = _.findIndex(top_classes, {class_name: test_class});

                    if(matchIndex > -1) {
                      match = true;
                      match_index_array[matchIndex]++;
                    } else {
                      test_result.incorrect_wrong_class++;
                    }
                  }
                } else {
                  test_result.incorrect_no_top_class++;
                }


                if (match) {
                  test_result.correct++;
                }
                else {
                  test_result.incorrect++;

                  console.log('----------------------------------------------------------------------');
                  console.log('missed...');
                  console.log('\tinput: ' + test_text);
                  console.log('\texpected answer: ' + test_class);

                  if (threshold_not_met) {
                    console.log('\tactual answer: ** threshold not met **');
                  } else {
                    console.log('\tactual answer:');
                    top_classes.forEach((matching_class)=> {
                      console.log('\t\t' + JSON.stringify(matching_class));
                    });
                  }
                  console.log('----------------------------------------------------------------------');
                }
              }

              callback();
            });
      }, function(err) {
        if(err) {
          reject(err); // should never see, b/c we never pass error to callback so we process all elements, without fail-fast behavior.
        } else {
          // resolved once all calls to NLC have completed.
          resolve();
        }
      });
    } catch(error) {
      reject(error);
    }
  });
}

readAndParseTestData().then(()=> {
  return retrieveClassifierStatus();
}).then(()=> {
  if(classifier_status.status !== 'Available') {
    return Promise.reject('ERROR: classifier not available. status: ' + classifier_status.status);
  }
}).then(()=> {
  return classifyAndCompare();
}).then(()=> {
  console.log();
  console.log('---------------------------------------------------------------');
  console.log('TEST RESULT: ' + classifier_status.name);
  console.log('\ttotal: ' + test_result.total);
  console.log('\terrors: ' + test_result.errors);
  console.log('\tcorrect: ' + test_result.correct);
  for(let index in match_index_array) {
    console.log(`\t\t${num_converter.toOrdinal(parseInt(index)+1)} suggestion: ${match_index_array[index]/test_result.total * 100}`);
  }
  console.log('\tincorrect: ' + test_result.incorrect);
  console.log('\t\t- wrong class  : ' + test_result.incorrect_wrong_class);
  console.log('\t\t- low threshold: ' + test_result.incorrect_threshold);
  console.log('\t\t- no top class : ' + test_result.incorrect_no_top_class);
  console.log('\t** PERCENT CORRECT: ' + (test_result.correct/test_result.total * 100) + ' **');
  console.log('---------------------------------------------------------------');
  console.log();
}).catch((error)=> {
  console.error(error);
  process.exit(11);
});
