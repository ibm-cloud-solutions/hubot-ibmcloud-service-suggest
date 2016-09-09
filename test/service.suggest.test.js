/*
 * Licensed Materials - Property of IBM
 * (C) Copyright IBM Corp. 2016. All Rights Reserved.
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
 */
'use strict';

const path = require('path');
const Helper = require('hubot-test-helper');
const helper = new Helper('../src/scripts');
const appRoot = require('app-root-path');
const expect = require('chai').expect;
const mockUtils = require('./service.suggest.mock.js');
const rewire = require('rewire');
const suggestListRewire = rewire('../src/scripts/suggest.list.js');
const suggestServiceRewire = rewire('../src/scripts/suggest.service.js');
const portend = require('portend');

// --------------------------------------------------------------
// i18n (internationalization)
// It will read from a peer messages.json file.  Later, these
// messages can be referenced throughout the module.
// --------------------------------------------------------------
var i18n = new (require('i18n-2'))({
  locales: ['en'],
  extension: '.json',
  // Add more languages to the list of locales when the files are created.
  directory: path.join(appRoot.toString(), 'src', 'messages'),
  defaultLocale: 'en',
  // Prevent messages file from being overwritten in error conditions (like poor JSON).
  updateFiles: false
});
// At some point we need to toggle this setting based on some user input.
i18n.setLocale('en');

describe('Interacting with Bluemix Service Suggest via Slack', function () {
  let room;

  before(function() {
    mockUtils.setupMockery();
  });

  beforeEach(function() {
    room = helper.createRoom();
  });

  afterEach(function() {
    room.destroy();
  });

  context('user calls `suggest list`', function() {
    it('should send a slack event with a list of supported services', function() {
      let p = portend.twice(room.robot, 'ibmcloud.formatter').then(events => {
        expect(events[0].message).to.be.a('string');
        expect(events[0].message).to.eql(i18n.__('suggest.list.services'));
        expect(events[1].attachments.length).to.eql(4);
        expect(events[1].attachments[0].title).to.eql('service0');
        expect(events[1].attachments[1].title).to.eql('service1');
        expect(events[1].attachments[2].title).to.eql('service2');
        expect(events[1].attachments[3].title).to.eql('service3');
      });

      room.user.say('mimiron', '@hubot suggest list');
      return p;
    });

    it('should send slack event with NLC not configured message', function() {
      var revert = suggestListRewire.__set__('env.isNlcConfigured', false);
      let p = portend.once(room.robot, 'ibmcloud.formatter').then(events => {
        expect(events[0].message).to.be.a('string');
        expect(events[0].message).to.eql(i18n.__('suggest.nlc.not.configured'));
        revert();
      });

      room.user.say('mimiron', '@hubot suggest list').then();
      return p;
    });

    it('should send slack event with empty list message', function() {
      var revert = suggestListRewire.__set__('servicesData.nlc_class_info', []);
      let p = portend.once(room.robot, 'ibmcloud.formatter').then(events => {
        expect(events[0].message).to.be.a('string');
        expect(events[0].message).to.eql(i18n.__('suggest.list.no.services'));
        revert();
      });

      room.user.say('mimiron', '@hubot suggest list');
      return p;
    });
  });

  context('user calls `suggest service`', function() {
    it('should send a slack event with top three matches', function() {
      let p = portend.twice(room.robot, 'ibmcloud.formatter').then(events => {
        expect(events[0].message).to.be.a('string');
        expect(events[1].attachments.length).to.eql(3);
      });

      room.user.say('mimiron', '@hubot suggest service top three');
      return p;
    });

    it('should send a slack event with top two matches', function() {
      let p = portend.twice(room.robot, 'ibmcloud.formatter').then(events => {
        expect(events[0].message).to.be.a('string');
        expect(events[1].attachments.length).to.eql(2);
      });

      room.user.say('mimiron', '@hubot suggest service not in data');
      return p;
    });

    it('should send a slack event with NLC not configured message', function() {
      var revert = suggestServiceRewire.__set__('env.isNlcConfigured', false);
      let p = portend.once(room.robot, 'ibmcloud.formatter').then(events => {
        expect(events[0].message).to.be.a('string');
        expect(events[0].message).to.eql(i18n.__('suggest.nlc.not.configured'));
        revert();
      });

      room.user.say('mimiron', '@hubot suggest service top three');
      return p;
    });

    it('should send a slack event with a still training message', function() {
      let p = portend.once(room.robot, 'ibmcloud.formatter').then(events => {
        expect(events[0].message).to.be.a('string');
        expect(events[0].message).to.eql(i18n.__('suggest.classifer.training'));
      });

      room.user.say('mimiron', '@hubot suggest service still training');
      return p;
    });

    it('should send a slack event with a no matches message', function() {
      let p = portend.once(room.robot, 'ibmcloud.formatter').then(events => {
        expect(events[0].message).to.be.a('string');
        expect(events[0].message).to.eql(i18n.__('suggest.no.matches'));
      });

      room.user.say('mimiron', '@hubot suggest service no matches');
      return p;
    });

    it('should send a slack event with an internal error message', function() {
      let p = portend.once(room.robot, 'ibmcloud.formatter').then(events => {
        expect(events[0].message).to.be.a('string');
        expect(events[0].message).to.contain(i18n.__('suggest.nlc.internal.error'));
      });

      room.user.say('mimiron', '@hubot suggest service internal error');
      return p;
    });

    it('should send a slack event with a 500 error message', function() {
      let p = portend.once(room.robot, 'ibmcloud.formatter').then(events => {
        expect(events[0].message).to.be.a('string');
        expect(events[0].message).to.eql(i18n.__('suggest.nlc.error'));
      });

      room.user.say('mimiron', '@hubot suggest service error');
      return p;
    });
  });

  context('user calls `suggest help`', function() {
    it('should respond with help', function() {
      let p = portend.once(room.robot, 'ibmcloud.formatter').then(events => {
        expect(events[0].message).to.be.a('string');
        expect(events[0].message).to.contain(i18n.__('help.suggest.list'));
        expect(events[0].message).to.contain(i18n.__('help.suggest.service'));
        expect(events[0].message).to.contain(i18n.__('help.suggest.examples.header'));
        expect(events[0].message).to.contain(i18n.__('help.suggest.example1'));
        expect(events[0].message).to.contain(i18n.__('help.suggest.example2'));
        expect(events[0].message).to.contain(i18n.__('help.suggest.example3'));
      });

      room.user.say('mimiron', '@hubot suggest help');
      return p;
    });
  });
});

describe('Interacting with Bluemix Service Suggest with classifier status training', function () {
  let room;

  before(function() {
    mockUtils.setupTrainingMockery();
  });

  beforeEach(function() {
    room = helper.createRoom();
  });

  afterEach(function() {
    room.destroy();
  });

  context('user calls `suggest service` while classifier is still in training', function() {
    it('should respond with still training message', function(done) {
      room.robot.on('ibmcloud.formatter', (event) => {
        expect(event.message).to.be.a('string');
        expect(event.message).to.contain(i18n.__('suggest.classifer.training'));
        done();
      });
      room.user.say('mimiron', '@hubot suggest service still training').then();
    });
  });
});
