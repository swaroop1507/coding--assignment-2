const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const dbPath = path.join(__dirname, 'twitterClone.db')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const app = express()
app.use(express.json())
let db = null

const intializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })

    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (error) {
    console.log(`DB Error:${error.message}`)
    process.exit(1)
  }
}

intializeDbAndServer()

const getfollowingPeopleIdsOfUser = async username => {
  const getfollowingPeopleQuery = `
  SELECT 
    following_user_id
  FROM follower
  INNER JOIN user on user.user_id = follower.follower_user_id
  WHERE user.username = '${username}';
  `
  const followingpeople = await db.all(getfollowingPeopleQuery)
  const arrayOfIds = followingpeople.map(eachUser => eachUser.following_user_id)
  return arrayOfIds
}

const authentication = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader) {
    jwtToken = authHeader.split(' ')[1]
  }

  if (jwtToken) {
    jwt.verify(jwtToken, 'SECRET_KEY', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        request.userId = payload.userId

        next()
      }
    })
  } else {
    response.status(401)
    response.send('Invalid JWT Token')
  }
}

const tweetActionVerfication = async (request, response, next) => {
  const {userId} = request
  const {tweetId} = request.params

  const getTweetQuery = `
  SELECT *
  FROM tweet
  INNER JOIN follower on tweet.user_id = follower.following_user_id
  WHERE tweet.tweet_id = '${tweetId}' AND follower_user_id = '${userId}' 
  `
  const tweet = await db.get(getTweetQuery)
  if (tweet === undefined) {
    response.status(400)
    response.send('Invalid Request')
  } else {
    next()
  }
}

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body

  const getUSerQuery = `
  SELECT  *
  FROM user
  WHERE username ='${username}'`

  const userDetails = await db.get(getUSerQuery)

  if (userDetails !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const createUserQuery = `
      INSERT INTO
        user(name,username,password,gender)
      VALUES
      ('${name}','${username}','${hashedPassword}','${gender}')
      `
      await db.run(createUserQuery)

      response.send('User created successfully')
    }
  }
})

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const getUserQuery = `
  SELECT * 
  FROM user 
  WHERE username = '${username}' 
  `
  const userDbDetails = await db.get(getUserQuery)

  if (userDbDetails !== undefined) {
    const isPasswordCorrect = await bcrypt.compare(
      password,
      userDbDetails.password,
    )
    if (isPasswordCorrect) {
      const payload = {username, userId: userDbDetails.user_id}
      const jwtToken = jwt.sign(payload, 'SECRET_KEY')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  } else {
    response.status(400)
    response.send('Invalid user')
  }
})

app.get('/user/tweets/feed/', authentication, async (request, response) => {
  const {username} = request
  const followingpeopleIds = await getfollowingPeopleIdsOfUser(username)
  const getTweetsQuery = `
  SELECT username,tweet,date_time AS dateTime
  FROM user INNER JOIN tweet ON user.user_id = tweet.user_id
  WHERE user.user_id IN '${followingpeopleIds}'
  ORDER BY dateTime DESC
  LIMIT 4;
  `
  const tweets = await db.all(getTweetsQuery)
  response.send(tweets)
})

app.get('/user/following/', authentication, async (request, response) => {
  const {username, userId} = request
  const getFollowingUserQuery = `
  SELECT name
  FROM follower
  INNER JOIN user ON user.user_id = follower.following_user_id
  WHERE follower_user_id = '${userId}'
  `
  const followingpeople = await db.all(getFollowingUserQuery)
  response.send(followingpeople)
})

app.get('/user/followers/', authentication, async (request, response) => {
  const {username, userId} = request
  const getFollowersQuery = `
   SELECT DISTINCT name
   FROM follower
   INNER JOIN user ON user.user_id = follower.follower_user_id
   WHERE following_user_id = '${userId}'
  `
  const followers = await db.all(getFollowersQuery)
  response.send(followers)
})

app.get(
  '/tweets/:tweetId/',
  authentication,
  tweetActionVerfication,
  async (request, response) => {
    const {username, userId} = request
    const {tweetId} = request.params
    const getTweetQuery = `
    SELECT tweet,
    (SELECT COUNT() FROM like WHERE tweet_id = '${tweetId}') As likes,
    (SELECT COUNT() FROM reply WHERE tweet_id = '${tweetId}') As replies,
    date_time AS dateTime
    FROM tweet
    WHERE tweet.tweet_id = '${tweetId}'
    `
    const tweet = await db.get(getTweetQuery)
    response.send(tweet)
  },
)

app.get(
  '/tweets/:tweetId/likes/',
  authentication,
  tweetActionVerfication,
  async (request, response) => {
    const {tweetId} = request.params
    const getlikesQuery = `
    SELECT username
    FROM user
    INNER JOIN like on user.user_id = like.user_id
    WHERE tweet_id = '${tweetId}'
    `
    const likedUsers = await db.all(getlikesQuery)
    const userArray = likedUsers.map(eachUser => eachUser.username)
    response.send({likes: userArray})
  },
)

app.get(
  '/tweets/:tweetId/replies/',
  authentication,
  tweetActionVerfication,
  async (request, response) => {
    const {tweetId} = request.params
    const getRepliedQuery = `
    SEELCT name,reply
    FROM user INNER JOIN reply ON user.user_id = reply.user_id
    WHERE tweet_id = '${tweetId}'
    `
    const repliedUser = await db.all(getRepliedQuery)
    response.send({replies: repliedUser})
  },
)

app.get('/user/tweets/', authentication, async (request, response) => {
  const {userId} = request
  const getTweetQuery = `
   SEELCT tweet,
   COUNT(DISTINCT like_id) AS likes,
   COUNT(DISTINCT reply_id) AS replies,
   date_time AS dateTime
   FROM tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id LEFT JOIN like ON tweet.tweet_id = like.tweet_id
   WHERE tweet.user_id = '${userId}'
   GROUP BY tweet.tweet_id
   `
  const tweets = await db.all(getTweetQuery)
  response.send(tweets)
})

app.post('/user/tweets/', authentication, async (request, response) => {
  const {tweet} = request.body
  const userId = parseInt(request.userId)
  const dateTime = new Date().toJSON().substring(0, 19).replace('T', ' ')
  const createTweetQuery = `
  INSERT INTO tweet(tweet,user_id,date_time)
  VALUES ('${tweet},'${userId}','${dateTime}')
  `
  await db.run(createTweetQuery)
  response.send('Created a Tweet')
})

app.delete('tweets/:tweetId/', authentication, async (request, response) => {
  const {tweetId} = request.params
  const {userId} = request
  const getTweetQuery = `
  SELECT *
  FROM tweet
  WHERE user_id = '${userId}' AND tweet_id = '${tweetId}';
  `
  const tweet = await db.get(getTweetQuery)
  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const deleteQuery = `
    DELETE FROM tweet
    WHERE tweet_id = '${tweetId}'
    `
    await db.run(deleteQuery)
    response.send('Tweet Removed')
  }
})

module.exports = app
