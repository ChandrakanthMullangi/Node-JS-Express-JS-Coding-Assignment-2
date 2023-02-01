const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

// API 1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUserQuery = `
        SELECT 
            *
        FROM
            user
        WHERE
            username='${username}';`;
  const dbUser = await db.get(checkUserQuery);
  if (dbUser === undefined) {
    if (password.length > 5) {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
                INSERT INTO
                    user(username, password, name, gender)
                VALUES (
                    '${username}',
                    '${hashedPassword}',
                    '${name}',
                    '${gender}'
                );`;
      await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// API 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkForUserQuery = `
        SELECT 
            *
        FROM
            user
        WHERE
            username='${username}';`;
  const dbUser = await db.get(checkForUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    isValidPassword = await bcrypt.compare(password, dbUser.password);
    if (isValidPassword === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API 3

app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    const { username } = request;
    const getUserIdQuery = `
        SELECT 
            *
        FROM 
            user
        WHERE 
            username= '${username}';`;

    const getUserId = await db.get(getUserIdQuery);

    const getTweetsQuery = `
        SELECT 
            user.username, 
            tweet.tweet, 
            tweet.date_time AS dateTime
        FROM 
            follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id 
            INNER JOIN user ON follower.following_user_id = user.user_id
        WHERE 
            follower.follower_user_id= ${getUserId.user_id}
        ORDER BY 
            tweet.date_time DESC
        LIMIT 
            4;`;
    const getTweetsResponse = await db.all(getTweetsQuery);
    response.send(getTweetsResponse);
  }
);

// API 4

app.get("/user/following/", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `
        SELECT 
            *
        FROM 
            user
        WHERE 
            username= '${username}';`;

  const getUserId = await db.get(getUserIdQuery);

  const getFollowersQuery = `
        SELECT 
            user.name AS name
        FROM 
            user INNER JOIN follower ON user.user_id = follower.following_user_id
        WHERE 
            follower.follower_user_id= ${getUserId.user_id};`;

  const getFollowersResponse = await db.all(getFollowersQuery);

  response.send(getFollowersResponse);
});

// API 5

app.get("/user/followers/", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `
        SELECT 
            *
        FROM 
            user
        WHERE 
            username= '${username}';`;

  const getUserId = await db.get(getUserIdQuery);

  const getFollowingQuery = `
        SELECT DISTINCT
            user.name AS name
        FROM 
            user INNER JOIN follower ON user.user_id = follower.follower_user_id
        WHERE 
            follower.following_user_id= ${getUserId.user_id};`;

  const getFollowingResponse = await db.all(getFollowingQuery);

  response.send(getFollowingResponse);
});

// API 6

app.get("/tweets/:tweetId/", authenticationToken, async (request, response) => {
  const { username } = request;

  const { tweetId } = request.params;

  const getUserIdQuery = `
        SELECT 
            *
        FROM 
            user
        WHERE 
            username= '${username}';`;

  const getUserId = await db.get(getUserIdQuery);

  const getTweetStatisticsQuery = `
        SELECT 
            tweet.tweet, 
            COUNT(DISTINCT like.like_id) as likes, 
            COUNT(DISTINCT reply.reply_id) as replies, 
            tweet.date_time AS dateTime
        FROM 
            ((tweet INNER JOIN like ON tweet.tweet_id= like.tweet_id) AS T 
            INNER JOIN reply ON like.tweet_id= reply.tweet_id) AS B 
            INNER JOIN follower ON follower.following_user_id= tweet.user_id
        WHERE 
            follower.follower_user_id= ${getUserId.user_id} 
            AND tweet.tweet_id= ${tweetId};`;

  const getTweetStatisticsResponse = await db.get(getTweetStatisticsQuery);

  if (getTweetStatisticsResponse.tweet === null) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(getTweetStatisticsResponse);
  }
});

// API 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  async (request, response) => {
    const username = request.username;
    const { tweetId } = request.params;
    const getUserIdQuery = `
        SELECT *
        FROM user
        WHERE username= '${username}';
    `;
    const getUserId = await db.get(getUserIdQuery);

    const getFollowerIdQuery = `
        SELECT DISTINCT 
            follower.following_user_id AS id
        FROM 
            follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id
        WHERE 
            follower.follower_user_id= ${getUserId.user_id} 
            AND tweet.tweet_id= ${tweetId};
    `;
    const getFollowerIdResponse = await db.all(getFollowerIdQuery);

    const userQuery = `
           SELECT 
                user.username AS name
           FROM 
                like INNER JOIN user ON like.user_id= user.user_id
           WHERE 
                like.tweet_id= ${tweetId};
        `;

    const userQueryResponse = await db.all(userQuery);

    if (getFollowerIdResponse[0] === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      let array = [];
      for (let i of userQueryResponse) {
        array.push(i["name"]);
      }
      response.send({ likes: array });
    }
  }
);

// API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  async (request, response) => {
    const username = request.username;
    const { tweetId } = request.params;
    const getUserIdQuery = `
        SELECT *
        FROM user
        WHERE username= '${username}';
    `;
    const getUserId = await db.get(getUserIdQuery);

    const getFollowerIdQuery = `
        SELECT DISTINCT 
            follower.following_user_id AS id
        FROM 
            follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id
        WHERE 
            follower.follower_user_id= ${getUserId.user_id} 
            AND tweet.tweet_id= ${tweetId};`;

    const getFollowerIdResponse = await db.all(getFollowerIdQuery);

    const userQuery = `
           SELECT 
                user.name AS name,
                reply.reply AS reply
           FROM 
                reply INNER JOIN user ON reply.user_id= user.user_id
           WHERE 
                reply.tweet_id= ${tweetId};
        `;

    const userQueryResponse = await db.all(userQuery);

    if (getFollowerIdResponse[0] === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      let array = [];
      for (let i of userQueryResponse) {
        array.push(i);
      }
      response.send({ replies: array });
    }
  }
);

// API 9

app.get("/user/tweets/", authenticationToken, async (request, response) => {
  const username = request.username;
  const { tweetId } = request.params;
  const getUserIdQuery = `
        SELECT 
            *
        FROM 
            user
        WHERE 
            username= '${username}';
    `;
  const getUserId = await db.get(getUserIdQuery);

  const userTweetsQuery = `
           SELECT 
                tweet.tweet as tweet, 
                COUNT(DISTINCT like.like_id) AS likes, 
                COUNT(DISTINCT reply.reply_id) AS replies, 
                tweet.date_time AS dateTime
           FROM 
                tweet LEFT JOIN like ON tweet.tweet_id= like.tweet_id 
                LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
           WHERE 
                tweet.user_id= ${getUserId.user_id}
           GROUP BY 
                tweet.tweet_id;`;

  const userTweetsResponse = await db.all(userTweetsQuery);

  if (userTweetsResponse[0] === null) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(userTweetsResponse);
  }
});

// API 10

app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const username = request.username;
  const { tweet } = request.body;
  const getUserIdQuery = `
        SELECT 
            *
        FROM 
            user
        WHERE 
            username= '${username}';
    `;
  const getUserId = await db.get(getUserIdQuery);

  const today = new Date();
  const time = today.getTime();

  const createTweetQuery = `
        INSERT INTO
            tweet(tweet, user_id, date_time)
        VALUES (
            '${tweet}',
            ${getUserId.user_id},
            datetime(1092941466, 'unixepoch', 'localtime')
            );`;
  const createTweetQueryResponse = await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

// API 11

app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    const username = request.username;
    const { tweetId } = request.params;
    const getUserIdQuery = `
            SELECT 
                *
            FROM 
                user
            WHERE 
                username= '${username}';`;
    const getUserId = await db.get(getUserIdQuery);

    const tweetQuery = `
            SELECT 
                tweet.tweet AS tweet
            FROM 
                tweet INNER JOIN user ON tweet.user_id= user.user_id
            WHERE 
                tweet.tweet_id= ${tweetId} AND tweet.user_id= ${getUserId.user_id};
  `;
    const tweetResponse = await db.all(tweetQuery);

    if (tweetResponse[0] === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `
        DELETE FROM 
            tweet
        WHERE 
            tweet_id= ${tweetId};
    `;
      const deleteTweetResponse = await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
