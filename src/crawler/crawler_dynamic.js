/*
 * Licensed Materials - Property of IBM
 * (C) Copyright IBM Corp. 2016. All Rights Reserved.
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
 */
'use strict';


var fs = require('fs');
var path = require('path');

var logger = require('winston');
var async = require('async');
var driver = require('node-phantom-simple');
var humanizeDuration = require('humanize-duration');
var _ = require('lodash');
var hashes = require('hashes');
var appRoot = require('app-root-path');

if(process.env.LOG_LVL) {
  logger.level = process.env.LOG_LVL;
} else {
  logger.level = 'info';
}

var browser;
const MAX_PAGE_LOAD_ATTEMPTS=3;
const filtered_extensions = ['.pdf', '.zip', '.tar', '.tar.gz', '.exe', '.mp4', '.mov']; // wouldn't crawl links to docs ending with these extensions.
const jquery_path = appRoot + path.sep + 'lib' + path.sep + 'jquery.min.js';

const cache_pageData = new hashes.HashTable(); // in-memory cache of all loaded pageData.  only cleared on release.
const cache_stats = {
  hits: 0,
  misses: 0
};

/*
 * This is a crawler implementation that works with dynamic webpages that use JS.  It works by loading the pages in slimerjs, see https://slimerjs.org/.
 * Then using a node to slimer bridge module (i.e. node-phantom-simple) to access the contents of the page.
 * 
 * Currently this crawler will only go 2 levels deep.
 * 
 * Usage pattern:
 *    var crawler_dynamic = require('./crawler_dynamic');
 *    crawler_dynamic.init()...
 *    crawler_dynamic.crawl(url)...
 *    crawler_dynamic.crawl(url)...
 *    crawler_dynamic.release()...
 *
 * The crawl method is resolved with 'pageData' objects that look like this:
 *
 * {
 *    url: 'http://www...',
 *    text: 'plain text after the page loads',
 *    links: [
 *        'http://www...',
 *        'http://www...'
 *    ]
 * }
 */
var initializeBrowser = function() {
  logger.debug('crawler_dynamic: initialize invoked');

  if(browser) {
    return Promise.reject('Crawler is already initialized.');
  }

  if(!fs.existsSync(jquery_path)) {
    return Promise.reject('jquery.min.js file does not exist.  Please download into lib folder from.  See README.md for more information.');
  }

  return new Promise((resolve, reject) => {
    try {
      driver.create({ path: require('slimerjs').path }, function (err, b) {
        if(err) {
          logger.error('critical error. unable to initialize browser.  error: ' + err);
          reject(err);
        } else {
          browser = b;
          resolve();
        }
      });
    } catch(error) {
      reject(error);
    }
  });
}

var getPageText = function(page) {
  return new Promise((resolve, reject) => {
    try {
      page.get('plainText', function (err, text) {
        if(err) {
          reject(err);
        } else {
          resolve(text);
        }
      });
    } catch(error) {
      reject(error);
    }
  });
}

// Injects jquery library into the loaded page to extract visible links.
var getVisiblePageLinks = function(page, url) {
  var window; // makes linter happy
  var $;

  return new Promise((resolve, reject) => {
    try {
      page.injectJs(jquery_path, function (errJQ) {
        if (errJQ) {
          reject(errJQ);
          return;
        }

        page.evaluate(function () {
          var visible_links = [];

          $('a:visible').each(function () {
            if (this.href && this.href.toLowerCase().startsWith('http')) {
              visible_links.push(this.href);
            }
          });

          // don't include anchors to the same page.
          var baseUrl = window.location.href;
          var anchorIndex = baseUrl.indexOf('#');

          if (anchorIndex > 0) {
            if (baseUrl.charAt(anchorIndex - 1) === '/') {
              baseUrl = baseUrl.substring(0, anchorIndex - 1);
            } else {
              baseUrl = baseUrl.substring(0, anchorIndex);
            }
          }

          visible_links = visible_links.filter((link)=> {
            if (link.startsWith(baseUrl + '#') || link.startsWith(baseUrl + '/#')) {
              return false;
            }
            return true;
          });

          return {
            page_url: window.location.href,
            visible_links: visible_links
          };
        }, function (err, result) {
          if(err) {
            reject(err);
          } else {
            if(!result || !result.visible_links) {
              // Have seen this for some pages that returned successful but weren't valid html docs.
              logger.warn('Unable to extract visible links.  url: ' + url);
              resolve([]);
            } else {
              // additional link processing
              result.visible_links = _.uniq(result.visible_links);
              result.visible_links = result.visible_links.filter((e)=>{
                for(let i in filtered_extensions) {
                  if(_.endsWith(e.toLowerCase(), filtered_extensions[i].toLowerCase())) {
                    logger.debug('url ends with filtered extension.  url: ' + e);
                    return false;
                  }
                }
                return true;
              });
              resolve(result.visible_links);
            }
          }
        });
      });
    } catch(error) {
      reject(error);
    }
  });
}

var getFromCache = function(url) {
  var hashEntry = cache_pageData.get(url);
  var pageData;

  if(hashEntry && hashEntry.value) {
    pageData = hashEntry.value;
    cache_stats.hits++;
  } else {
    cache_stats.misses++;
  }

  return pageData;
}

var addToCache = function(url, pageData) {
  cache_pageData.add(url, pageData);
}

// creates and opens a page.  resolves promise with "pageData" object for this url.
var loadPage = function(url, loadAttemptCount) {
  logger.debug('loadPage invoked.  url: ' + url);
  
  if(!browser) {
    return Promise.reject('Unable to load page.  Browser not properly initialized.');
  }

  if(!loadAttemptCount) {
    loadAttemptCount = 1; // first attempt
  } else {
    loadAttemptCount++;
  }
  
  if(loadAttemptCount > MAX_PAGE_LOAD_ATTEMPTS) {
    return Promise.reject(`Page failed to reload ${MAX_PAGE_LOAD_ATTEMPTS} times.  url: ${url}`);
  }

  var cachedPageData = getFromCache(url);
  if(cachedPageData) {
    return Promise.resolve(cachedPageData);
  }

  return new Promise((resolve, reject) => {
    try {
      logger.debug('before createPage.  url: ' + url);
      browser.createPage(function (err, page) {
        logger.debug('inside createPage.  url: ' + url + ' err: ' + err);
        if(err) {
          reject(err);
          return;
        }

        // Need to size page b/c some links may not render when using slimerjs smaller default page size.
        page.set('viewportSize.width', 1024);
        page.set('viewportSize.height', 1024);

        // This technique is used to detect when a page finishes loading.  The alternative is to always wait X seconds.
        // That can add up to a lot of time, so we try to detect if a page has finished loading sooner.
        var pendingResourceCount = 0,
          noLoadingTime = 300,
          noLoadingTimeout, // timeout that will fire if no resources are loaded for this page since noLoadingTime.
          maxWaitTime = 10000,
          maxWaitTimeout, // timeout will fire once we've waited the max amount of time for the page to load.
          doneInvoked = false, // prevents done from running twice due to 2 callbacks firing
          pageOpenFailed = false;

        // slimerjs sometimes crashes when attempting to open a page.  In this case, the browser is in an unusable state
        // so here we attempt to spawn another instance and reload the page that the crash happens on.
        var handlePageOpenError = function(openError) {
          pageOpenFailed = true;
          logger.error('ERROR: browser encountered error while opening page.  url: ' + url);
          logger.error(openError);

          logger.info('Attempting to reinitialize browser...');
          browser = null;

          initializeBrowser().then(()=> {
            logger.info('browser has been reinitialized.');
            logger.info('Attempting to reload page.  url: ' + url);
            return loadPage(url, loadAttemptCount);
          }).then((pageData)=>{
            logger.info('Successfully reloaded page.  url: ' + url);
            resolve(pageData);
          }).catch((error)=>{
            logger.error('ERROR: failed to reinitialize browser and reload page.');
            reject(error);
          });
        };

        var pageLoadDone = function(doneError, skipClose) {
          if(doneInvoked || pageOpenFailed) {
            return;
          }

          doneInvoked = true;
          clearTimeout(noLoadingTimeout);
          clearTimeout(maxWaitTimeout);

          if(doneError) {
            if(skipClose === true) {
              reject(doneError);
            } else {
              page.close(function(closeError) {
                if(closeError) {
                  logger.error('error closing page. url: ' + url + 'err: ' + closeError);
                }

                reject(doneError);
              });
            }
          } else {
            var pageData = {
              url: url
            };

            getPageText(page).then((text)=>{
              pageData.text = text;
              return getVisiblePageLinks(page, url);
            }).then((links)=> {
              pageData.links = links;
            }).catch((error)=> {
              return error; // keep chain going so that close always happens.
            }).then((error)=> {
              page.close(function(closeError) {
                if(closeError) {
                  logger.error('error closing page. url: ' + url + 'err: ' + err);
                }

                if(error || closeError) {
                  reject(error || closeError);
                }
                else {
                  logger.debug('page successfully loaded.  url: ' + url + ' links: ' + pageData.links.length);
                  addToCache(url, pageData);
                  resolve(pageData);
                }
              });
            });
          }
        };

        page.onResourceRequested = function (req) {
          pendingResourceCount += 1;
          clearTimeout(noLoadingTimeout);
        };

        page.onResourceReceived = function (res) {
          if (!res.stage || res.stage === 'end') {
            pendingResourceCount -= 1;
            if (pendingResourceCount === 0) {
              noLoadingTimeout = setTimeout(pageLoadDone, noLoadingTime);
            }
          }
        };

        try {
          logger.debug('before page.open. url: ' + url);
          page.open(url, function (openError, status) {
            logger.debug('inside page.open. url: ' + url + ' status: ' + status + ' openError: ' + openError);
            if (openError) {
              let message = 'error while opening page: ' + url + '\n';
              message += 'error: ' + JSON.stringify(openError, null, 2);
              handlePageOpenError(message);
            } else if (status !== 'success') {
              let message = 'unable to loading page.  status: ' + status + ' page: ' + url;
              pageLoadDone(message);
            } else {
              maxWaitTimeout = setTimeout(function () {
                logger.debug('force timeout loading resource: ' + url);
                pageLoadDone();
              }, maxWaitTime);
            }
          });
        }catch(error) {
          reject(error);
        }
      });
    } catch(error) {
      reject(error);
    }
  });
}

// resolved with array of 'pageData' for all pages that were loaded/processed successfully.
var loadMultiplePages = function (urls) {
  var startTime = new Date();
  var pageDataArray = [];
  var loadCount = 1; // +1 for the root doc that was already loaded
  var docCount = urls.length + 1;

  if(!urls || !urls.length) {
    return Promise.resolve(pageDataArray);
  }

  return new Promise((resolve, reject) => {
    async.eachLimit(urls, 1, function (url, callback) {
      loadPage(url).then((pageData)=> {
        pageDataArray.push(pageData);
      }).catch((error)=> {
        logger.error(error); // don't pass error to callback, so that as many pages as possible will load (prevent's fail-fast behavior)
      }).then(()=>{
        loadCount++;
        if(loadCount % 5 === 0 || loadCount === docCount) {
          logger.info(`crawl status: ${Math.round((loadCount/docCount * 100))}% complete (${loadCount} of ${docCount})`);
          if(loadCount === docCount) {
            logger.info('crawl elapsed time: ' + humanizeDuration(new Date().getTime() - startTime.getTime()));
          }
        }
        callback();
      });
    }, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve(pageDataArray);
      }
    });
  });
}

// Does 2 level deep crawl of the provided URL.  Resolves with an array of 'pageData' objects.
var crawlUrl = function(url) {
  logger.debug('crawler_dynamic: crawlUrl invoked, url: ' + url);

  if(!browser) {
    return Promise.reject('Crawler not properly initialized.');
  }

  return new Promise((resolve, reject) => {
    let crawler_result = [];

    try {
      loadPage(url).then((pageData)=> {
        crawler_result.push(pageData);
        return loadMultiplePages(pageData.links);
      }).then((pageDataArray)=> {
        crawler_result = crawler_result.concat(pageDataArray);
      }).then(()=> {
        logger.info(`crawler cache stats.  size: ${cache_pageData.count()} hits: ${cache_stats.hits} misses: ${cache_stats.misses}`);
        logger.silly('-------------------------------------------------------------------');
        logger.silly('crawler output for url: ' + url + '\n');
        logger.silly(JSON.stringify(crawler_result, null, 2));
        logger.silly('-------------------------------------------------------------------');

        resolve(crawler_result);
      }).catch((error)=> {
        reject(error);
      });
    } catch(error) {
      reject(error);
    }
  });
}

var exitBrowser = function() {
  logger.debug('crawler_dynamic: release invoked');
  cache_pageData.clear();

  if(!browser) {
    return Promise.reject('Crawler not properly initialized.');
  }

  return new Promise((resolve, reject) => {
    try {
      browser.exit(function (err) {
        if(err) {
          reject(err);
        } else {
          browser = null;
          resolve();
        }
      });
    } catch(error) {
      reject(error);
    }
  });
}

module.exports.initialize = initializeBrowser;
module.exports.crawl = crawlUrl;
module.exports.release = exitBrowser;
