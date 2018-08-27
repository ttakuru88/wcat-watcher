'use strict'

var aws = require('aws-sdk')
var Twitter = require('twitter')
var request = require('request')

let bucket = 'takuru-lambda-data'
let dataKey = 'wcat_watcher_max_tweet_id'
let watchAccount = 'wcat_project'

aws.config.region = 'ap-northeast-1';
var s3 = new aws.S3({ apiVersion: '2006-03-01' });

exports.handler = (event, context, callback) => {
  s3.getObject({
    Bucket: bucket,
    Key: dataKey
  }, (err, data) => {
    if(err) {
      context.done()
      return
    }

    onGetS3Object(context, data.Body.toString())
  })
}

var onGetS3Object = (context, maxTweetId) => {
  var twitterClient = new Twitter({
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
    access_token_key: process.env.TWITTER_ACCESS_TOKEN,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
  })

  console.log(`maxTweetId: ${maxTweetId}`)
  let attachments = []
  twitterClient.get('statuses/user_timeline', {screen_name: watchAccount, since_id: maxTweetId, count: 5}, (err, tweets, response) => {
    if(err) {
      console.log(err)
      context.done()
      return
    }

    onGetTweets(context, maxTweetId, tweets)
  })
}

var putMaxTweetId = (context, maxTweetId) => {
  console.log(`nextMaxTweetId: ${maxTweetId}`)

  s3.putObject({
    Bucket: bucket,
    Key: dataKey,
    ContentType: 'text/plain',
    Body: maxTweetId
  }, (err, data) => {
    context.done()
  })
}

var onGetTweets = (context, maxTweetId, tweets) => {
  let nextMaxTweetId = maxTweetId
  let noticed = 0

  for(let i=tweets.length-1; i>=0; i--) {
    let tweet = tweets[i]
    nextMaxTweetId = tweet.id_str

    if(tweet.retweeted_status) {
      if(++noticed >= tweets.length) {
        putMaxTweetId(context, nextMaxTweetId)
      }
    }
    else{
      var message = tweet.text
      if(tweet.entities.urls.length <= 0) {
        message += `\nhttps://twitter.com/i/web/status/${tweet.id_str}`
      }
      var formData = {message: message}
      var headers = {'Authorization': `Bearer ${process.env.LINE_API_KEY}`}
      request.post({url: 'https://notify-api.line.me/api/notify', form: formData, headers: headers}, (err, httpResponse, body) => {
        if(JSON.parse(body).status != 200) {
          console.log(body)
          context.done()
          return
        }
        if(++noticed < tweets.length) {
          return
        }

        putMaxTweetId(context, nextMaxTweetId)
      })
    }
  }
}
