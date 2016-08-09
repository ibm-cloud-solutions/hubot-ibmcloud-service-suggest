/*
  * Licensed Materials - Property of IBM
  * (C) Copyright IBM Corp. 2016. All Rights Reserved.
  * US Government Users Restricted Rights - Use, duplication or
  * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
  */
'use strict';
const nock = require('nock');
const path = require('path');
const env = require(path.resolve(__dirname, '..', 'src', 'lib', 'env'));

const nlcEndpoint = env.nlc.url;

const mockClassify = require(path.resolve(__dirname, 'resources', 'mock.classify.json'));
const mockClassifierList = require(path.resolve(__dirname, 'resources', 'mock.classifierList.json'));
const mockClassifierStatusAvailable = require(path.resolve(__dirname, 'resources', 'mock.classifierAvailable.json'));
const mockClassifierStatusTraining = require(path.resolve(__dirname, 'resources', 'mock.classifierTraining.json'));

module.exports = {
  setupMockery: function() {
    nock.disableNetConnect();

    let nlcScope = nock(nlcEndpoint).persist();

		// Mock route to list all classifiers.
    nlcScope.get('/v1/classifiers').reply(200, function() {
      return mockClassifierList;
    });

		// Mock route for classifier status.
    nlcScope.get('/v1/classifiers/cd02b5x110-nlc-5103').reply(200, mockClassifierStatusAvailable);

		// Mock route to get classification data
    nlcScope.post('/v1/classifiers/cd02b5x110-nlc-5103/classify', {
      text: 'top three'
    }).reply(200, mockClassify.topThree);

    nlcScope.post('/v1/classifiers/cd02b5x110-nlc-5103/classify', {
      text: 'not in data'
    }).reply(200, mockClassify.notInServiceData);

    nlcScope.post('/v1/classifiers/cd02b5x110-nlc-5103/classify', {
      text: 'still training'
    }).reply(200, mockClassify.stillTraining);

    nlcScope.post('/v1/classifiers/cd02b5x110-nlc-5103/classify', {
      text: 'no matches'
    }).reply(200, mockClassify.noMatches);

    nlcScope.post('/v1/classifiers/cd02b5x110-nlc-5103/classify', {
      text: 'internal error'
    }).reply(200, 'Some 500 internal error message from the NLC service');

    nlcScope.post('/v1/classifiers/cd02b5x110-nlc-5103/classify', {
      text: 'error'
    }).reply(500, 'Some 500 error message from the NLC service');

    // Mock route for when the old classifier is deleted
    nlcScope.delete('/v1/classifiers/cd02b5x110-nlc-old').reply(200, function() {
      return {};
    });
  },
  setupTrainingMockery: function() {
    nock.cleanAll();
    nock.disableNetConnect();
    let nlcScope = nock(nlcEndpoint).persist();

    // Mock route to list all classifiers.
    nlcScope.get('/v1/classifiers').reply(200, function() {
      return mockClassifierList;
    });

    // Mock route for classifier status.
    nlcScope.get('/v1/classifiers/cd02b5x110-nlc-5103').reply(200, mockClassifierStatusTraining);

    // Mock route for when the old classifier is deleted
    nlcScope.delete('/v1/classifiers/cd02b5x110-nlc-old').reply(200, function() {
      return {};
    });
  }
};
