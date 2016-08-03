/*
 * Licensed Materials - Property of IBM
 * (C) Copyright IBM Corp. 2016. All Rights Reserved.
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
 */
'use strict';

var crawler = require('js-crawler');
var logger = require('winston');
var _ = require('lodash');

if(process.env.LOG_LVL) {
  logger.level = process.env.LOG_LVL;
} else {
  logger.level = 'info';
}

/*
 * This is a crawler implementation that works with static webpages.  Essential it's a wrapper on top of an open source crawler that provides
 * the below usage pattern and returns pageData objects as defined below.
 * 
 * Usage pattern:
 *    var crawler_static = require('./crawler_static');
 *    crawler_static.init()...
 *    crawler_static.crawl(url)...
 *    crawler_static.crawl(url)...
 *    crawler_static.release()...
 *
 * The crawl method is resolved with 'pageData' objects that only contain urls for all the detected pages.
 * Consumers of this crawler need to be able to consume only URLs.
 *
 * {
 *    url: 'http://www...'
 * }
 */
var initialize = function() {
  // does nothing for the static implementation.
  logger.debug('crawler_static: initialize invoked');
  return Promise.resolve();
}

var release = function() {
  // does nothing for the static implementation.
  logger.debug('crawler_static: release invoked');
  return Promise.resolve();
}

// Does 2 level deep crawl of the provided URL.  Resolves with an array of 'pageData' objects.
var crawlUrl = function(url) {
  logger.debug('crawler_static: crawlUrl invoked, url: ' + url);

  return new Promise((resolve, reject) => {
    var c = new crawler().configure({depth: 2});

    c.crawl({
      url: url,
      success: function(page) {
        logger.silly('crawler_static - successfully crawled page: ' + page.url);
      },
      failure: function(page) {
        // consider debug level, as some crawled resources might not be accessible.
        logger.debug('crawler_static - failed crawling page: ' + page.url + ' status: ' + page.status);
      },
      finished: function(crawledUrls) {
        crawledUrls = _.uniq(crawledUrls);

        let crawler_result = crawledUrls.map((element)=>{
          return {
            url: element
          }
        });

        logger.silly('-------------------------------------------------------------------');
        logger.silly('crawler output for url: ' + url + '\n');
        logger.silly(JSON.stringify(crawler_result, null, 2));
        logger.silly('-------------------------------------------------------------------');
        
        resolve(crawler_result);
      }
    });
  });
}

module.exports.initialize = initialize;
module.exports.crawl = crawlUrl;
module.exports.release = release;
