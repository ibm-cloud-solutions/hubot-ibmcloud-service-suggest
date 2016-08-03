/*
 * Licensed Materials - Property of IBM
 * (C) Copyright IBM Corp. 2016. All Rights Reserved.
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
 */
'use strict';

const rewire = require('rewire');
const indexAPI = rewire('../index');

const index = {};
index.readScripts = indexAPI.__get__('readScripts');

// Passing arrow functions to mocha is discouraged: https://mochajs.org/#arrow-functions
// return promises from mocha tests rather than calling done() - http://tobyho.com/2015/12/16/mocha-with-promises/
describe('Interacting with Bluemix via Slack', function() {

  context('index.js does not explode', function() {
    let fakeRobot = {
      logger: {
        info: function(msg) {

        }
      },
      loadFile: function(r, p) {
      }
    };

    it('should pass', function() {
      index.readScripts(fakeRobot);
    });

    it('should pass', function() {
      indexAPI(fakeRobot);
    });
  });
});
