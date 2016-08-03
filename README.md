[![Build Status](https://travis-ci.org/ibm-cloud-solutions/hubot-ibmcloud-service-suggest.svg?branch=master)](https://travis-ci.org/ibm-cloud-solutions/hubot-ibmcloud-service-suggest)
[![Coverage Status](https://coveralls.io/repos/github/ibm-cloud-solutions/hubot-ibmcloud-service-suggest/badge.svg?branch=cleanup)](https://coveralls.io/github/ibm-cloud-solutions/hubot-ibmcloud-service-suggest?branch=master)
[![Dependency Status](https://dependencyci.com/github/ibm-cloud-solutions/hubot-ibmcloud-service-suggest/badge)](https://dependencyci.com/github/ibm-cloud-solutions/hubot-ibmcloud-service-suggest)
[![npm](https://img.shields.io/npm/v/hubot-ibmcloud-service-suggest.svg?maxAge=2592000)](https://www.npmjs.com/package/hubot-ibmcloud-service-suggest)

# hubot-bluemix-suggest

A hubot script for providing assistance to a user who needs help finding Bluemix service(s) that match his needs.

## Getting Started
* [Usage](#usage)
* [Commands](#commands)
* [Hubot Adapter Setup](#hubot-adapter-setup)
* [Development](#development)
* [License](#license)
* [Contribute](#contribute)

## Usage

Steps for adding this to your existing hubot:

1. `cd` into your hubot directory
2. Install the app management functionality with `npm install hubot-ibmcloud-service-suggest --save`
3. Add `hubot-ibmcloud-service-suggest` to your `external-scripts.json`
4. Add the necessary environment variables:
```
export HUBOT_WATSON_NLC_URL=<API URL for Watson Natural Language Classifier>
export HUBOT_WATSON_NLC_USERNAME=<Watson NLC Username>
export HUBOT_WATSON_NLC_PASSWORD=<Watson NLC Password>
```

5. Start up your bot & off to the races!

## Commands
- `hubot suggest list` - Show services bot is trained to suggest.
- `hubot suggest services to ...` - Suggest services to fit your needs.

## Hubot Adapter Setup

Hubot supports a variety of adapters to connect to popular chat clients.  For more feature rich experiences you can setup the following adapters:
- [Slack setup](https://github.com/ibm-cloud-solutions/hubot-ibmcloud-service-suggest/blob/master/docs/adapters/slack.md)
- [Facebook Messenger setup](https://github.com/ibm-cloud-solutions/hubot-ibmcloud-service-suggest/blob/master/docs/adapters/facebook.md)

## Development

Please refer to the [CONTRIBUTING.md](https://github.com/ibm-cloud-solutions/hubot-ibmcloud-service-suggest/blob/master/CONTRIBUTING.md) before starting any work.  Steps for running this script for development purposes:

### NLC training

1. Update `env` in the `config` folder, with the following contents:
```
export HUBOT_BLUEMIX_API=<Bluemix API URL>
export HUBOT_BLUEMIX_ORG=<Bluemix Organization>
export HUBOT_BLUEMIX_SPACE=<Bluemix space>
export HUBOT_BLUEMIX_USER=<Bluemix User ID>
export HUBOT_BLUEMIX_PASSWORD=<Password for the Bluemix use>
```
2. Download the jquery.min.js library to the `lib` folder of this project.  This can be obtained from here: http://ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js
3. Run `npm run update-config` to generate or update `data/services-data.json`.
4. Review `data/services-data.json` file changes.  Load the doc page of added services to confirm quality of doc and what the service is called on the doc pages.  If services is referred to by names other than their doc_name attribute, then add those names to doc_name.
5. Use crawler to produce training data:
  - `npm run crawler -- --key=<YOUR_ALCHEMY_API_KEY>`
6. Review output from crawler and copy the generated csv file into the data directory using the next version number of the `data/hubot-service-suggest` .csv file.
  - `cp output/nlcTrainingData.csv data/hubot-service-suggest_v2.csv`
7. Remove the previous version of the .csv file
  - `rm data/hubot-service-suggest_v1.csv`

The bot will automatically detect the version update and train with the new .csv file.

### Configuration Setup

1. Create `config` folder in root of this project.
2. Create `env` in the `config` folder, with the following contents:
```
export HUBOT_WATSON_NLC_URL=<API URL for Watson Natural Language Classifier>
export HUBOT_WATSON_NLC_USERNAME=<Watson NLC Username>
export HUBOT_WATSON_NLC_PASSWORD=<Watson NLC Password>
```
3. In order to view content in chat clients you will need to add `hubot-ibmcloud-formatter` to your `external-scripts.json` file. Additionally, if you want to use `hubot-help` to make sure your command documentation is correct. Create `external-scripts.json` in the root of this project
```
[
    "hubot-help",
    "hubot-ibmcloud-formatter"
]
```
4. Lastly, run `npm install` to obtain all the dependent node modules.

### Running Hubot with Adapters

Hubot supports a variety of adapters to connect to popular chat clients.

If you just want to use:
 - Terminal: run `npm run start`
 - [Slack: link to setup instructions](https://github.com/ibm-cloud-solutions/hubot-ibmcloud-service-suggest/blob/master/docs/adapters/slack.md)
 - [Facebook Messenger: link to setup instructions](https://github.com/ibm-cloud-solutions/hubot-ibmcloud-service-suggest/blob/master/docs/adapters/facebook.md)


## License

See [LICENSE.txt](https://github.com/ibm-cloud-solutions/hubot-ibmcloud-service-suggest/blob/master/LICENSE.txt) for license information.

## Contribute

Please check out our [Contribution Guidelines](https://github.com/ibm-cloud-solutions/hubot-ibmcloud-service-suggest/blob/master/CONTRIBUTING.md) for detailed information on how you can lend a hand.
