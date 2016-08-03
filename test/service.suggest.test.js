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

describe('Interacting with bmsuggest', function () {
  let room;

  before(function() {
    mockUtils.setupMockery();
  });

  beforeEach(function() {
    room = helper.createRoom();
    // Force all emits into a reply.
    room.robot.on('ibmcloud.formatter', function(event) {
      if (event.message) {
        event.response.reply(event.message);
      }
      else {
        event.response.send({attachments: event.attachments});
      }
    });
  });

  afterEach(function() {
    room.destroy();
  });

  context('user calls `suggest list`', function() {
    it('should send a slack event with a list of supported services', function(done) {
      room.robot.on('ibmcloud.formatter', function(event) {
        if (event.attachments && event.attachments.length >= 1){
          expect(event.attachments.length).to.eql(4);
          expect(event.attachments[0].title).to.eql('service0');
          expect(event.attachments[1].title).to.eql('service1');
          expect(event.attachments[2].title).to.eql('service2');
          expect(event.attachments[3].title).to.eql('service3');
          done();
        }
      });
      room.user.say('mimiron', '@hubot suggest list').then();
    });
  });

  context('user calls `suggest service`', function() {
    it('should send a slack event with top three matches', function(done) {
      room.robot.on('ibmcloud.formatter', function(event) {
        if (event.attachments && event.attachments.length >= 1){
          expect(event.attachments.length).to.eql(3);
          done();
        }
      });
      room.user.say('mimiron', '@hubot suggest service top three').then();
    });
  });

  context('user calls `suggest service` while classifier is still training', function() {
    it('should send a slack event with a still training message', function(done) {
      room.robot.on('ibmcloud.formatter', function(event) {
        expect(event.message).to.be.a('string');
        expect(event.message).to.contain(i18n.__('suggest.classifer.training'));
        done();
      });
      room.user.say('mimiron', '@hubot suggest service still training').then();
    });
  });

  context('user calls `suggest service` but there are no matches', function() {
    it('should send a slack event with a no matches message', function(done) {
      room.robot.on('ibmcloud.formatter', function(event) {
        expect(event.message).to.be.a('string');
        expect(event.message).to.contain(i18n.__('suggest.no.matches'));
        done();
      });
      room.user.say('mimiron', '@hubot suggest service no matches').then();
    });
  });

  context('user calls `suggest service` with NLC error', function() {
    it('should send a slack event with a 500 error message', function(done) {
      room.robot.on('ibmcloud.formatter', function(event) {
        expect(event.message).to.be.a('string');
        expect(event.message).to.contain(i18n.__('suggest.nlc.error'));
        done();
      });
      room.user.say('mimiron', '@hubot suggest service error').then();
    });
  });

  context('user calls `suggest help`', function() {
    it('should respond with help', function(done) {
      room.robot.on('ibmcloud.formatter', (event) => {
        if (event.message) {
          expect(event.message).to.be.a('string');
          expect(event.message).to.contain(i18n.__('help.suggest.list'));
          expect(event.message).to.contain(i18n.__('help.suggest.service'));
          expect(event.message).to.contain(i18n.__('help.suggest.examples.header'));
          expect(event.message).to.contain(i18n.__('help.suggest.example1'));
          expect(event.message).to.contain(i18n.__('help.suggest.example2'));
          expect(event.message).to.contain(i18n.__('help.suggest.example3'));
          done();
        }
      });
      room.user.say('mimiron', '@hubot suggest help').then();
    });
  });
});
