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

describe('Interacting with Bluemix Service Suggest via Natural Language', function () {
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

      var res = { message: {text: 'list services you can suggest', user: {id: 'mimiron'}}, response: room };
      room.robot.emit('bluemix.suggest.list', res, {});
      return p;
    });
  });

  context('user calls `suggest service`', function() {
    it('should send a slack event with top three matches', function() {
      let p = portend.twice(room.robot, 'ibmcloud.formatter').then(events => {
        expect(events[0].message).to.be.a('string');
        expect(events[1].attachments.length).to.eql(3);
      });

      var res = { message: {text: 'top three', user: {id: 'mimiron'}}, response: room };
      room.robot.emit('bluemix.suggest.service', res, {});
      return p;
    });
  });

  context('user calls `suggest service` while classifier is still training', function() {
    it('should send a slack event with a still training message', function() {
      let p = portend.once(room.robot, 'ibmcloud.formatter').then(events => {
        expect(events[0].message).to.be.a('string');
        expect(events[0].message).to.eql(i18n.__('suggest.classifer.training'));
      });

      var res = { message: {text: 'still training', user: {id: 'mimiron'}}, response: room };
      room.robot.emit('bluemix.suggest.service', res, {});
      return p;
    });
  });

  context('user calls `suggest service` but there are no matches', function() {
    it('should send a slack event with a no matches message', function() {
      let p = portend.once(room.robot, 'ibmcloud.formatter').then(events => {
        expect(events[0].message).to.be.a('string');
        expect(events[0].message).to.eql(i18n.__('suggest.no.matches'));
      });

      var res = { message: {text: 'no matches', user: {id: 'mimiron'}}, response: room };
      room.robot.emit('bluemix.suggest.service', res, {});
      return p;
    });
  });

  context('user calls `suggest service` with NLC error', function() {
    it('should send a slack event with a 500 error message', function() {
      let p = portend.once(room.robot, 'ibmcloud.formatter').then(events => {
        expect(events[0].message).to.be.a('string');
        expect(events[0].message).to.eql(i18n.__('suggest.nlc.error'));
      });

      var res = { message: {text: 'error', user: {id: 'mimiron'}}, response: room };
      room.robot.emit('bluemix.suggest.service', res, {});
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

      var res = { message: {text: 'need help with service suggestions', user: {id: 'mimiron'}}, response: room };
      room.robot.emit('bluemix.suggest.help', res, {});
      return p;
    });
  });
});
