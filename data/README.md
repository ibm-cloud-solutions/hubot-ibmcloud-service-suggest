This directory contains the following notable files used by the service suggest project:

1. hubot-service-suggest-{VERSION}.csv - This is the training data used to train the NLC instance that will classify queries for service suggestions.  This file is generated by the nlc.data.generator utility.
2. service-data.json - This is the input file for the crawler which list all the services.  This file is created by the nlc.config.update utility and is used as input to the generator utility.
  
## Important Notes

* These 2 files need to stay in sync.  If the service-data.json is updated and new service training csv data is produced, then the version number in the name of the csv file needs to be increased.
