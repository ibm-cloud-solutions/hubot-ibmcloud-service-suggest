# crawler tester

This directory contains a test application to help understand how effective it is to use crawler data to train NLC.  Start by running the crawler and using it's output to train an NLC classifier as descriped in the readme of this node project.

After the classifier is trained create a file named test.env in this directory with the following contents:

HUBOT_WATSON_NLC_USERNAME=`<your_nlc_username>`  
HUBOT_WATSON_NLC_PASSWORD=`<your_nlc_password>`
HUBOT_WATSON_NLC_CLASSIFIER=`<your_nlc_classifier_id>`  

Then in the project directory run `npm run crawler-tester`.  This will read the test-data.csv file which contains user input and expected category.  The command will use your classifier to classify each input and produce output as such:

---------------------------------------------------------------  
TEST RESULT:  
&nbsp;&nbsp;errors: 0  
&nbsp;&nbsp;correct: 21  
&nbsp;&nbsp;incorrect: 12  
&nbsp;&nbsp;&nbsp;&nbsp;- wrong class  : 6  
&nbsp;&nbsp;&nbsp;&nbsp;- low threshold: 6  
&nbsp;&nbsp;&nbsp;&nbsp;- no top class : 0  
&nbsp;&nbsp;PERCENT CORRECT: 63.63636363636363  
---------------------------------------------------------------  

This tells you how many classifications are correct vs incorrect and why they were incorrect.  That is, wrong class vs threshold is too low.

Run `npm run crawler-tester -- --help` for list of options supported by the tester app.
