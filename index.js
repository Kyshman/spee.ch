// load dependencies
const express = require('express');
const bodyParser = require('body-parser');
const expressHandlebars = require('express-handlebars');
const Handlebars = require('handlebars');
const { populateLocalsDotUser, serializeSpeechUser, deserializeSpeechUser } = require('./helpers/authHelpers.js');
const config = require('./config/speechConfig.js');
const logger = require('winston');
const helmet = require('helmet');
const PORT = 3000; // set port
const app = express(); // create an Express application
const passport = require('passport');
const cookieSession = require('cookie-session');

// configure logging
const logLevel = config.logging.logLevel;
require('./config/loggerConfig.js')(logger, logLevel);
require('./config/slackConfig.js')(logger);

// check for global config variables
require('./helpers/configVarCheck.js')();

// trust the proxy to get ip address for us
app.enable('trust proxy');

// add middleware
app.use(helmet()); // set HTTP headers to protect against well-known web vulnerabilties
app.use(express.static(`${__dirname}/public`)); // 'express.static' to serve static files from public directory
app.use(bodyParser.json()); // 'body parser' for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // 'body parser' for parsing application/x-www-form-urlencoded
app.use((req, res, next) => {  // custom logging middleware to log all incoming http requests
  logger.verbose(`Request on ${req.originalUrl} from ${req.ip}`);
  next();
});

// configure passport
passport.serializeUser(serializeSpeechUser);
passport.deserializeUser(deserializeSpeechUser);
const localSignupStrategy = require('./passport/local-signup.js');
const localLoginStrategy = require('./passport/local-login.js');
passport.use('local-signup', localSignupStrategy);
passport.use('local-login', localLoginStrategy);
// initialize passport
app.use(cookieSession({
  name  : 'session',
  keys  : [config.session.sessionKey],
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
}));
app.use(passport.initialize());
app.use(passport.session());

// configure handlebars & register it with express app
const hbs = expressHandlebars.create({
  defaultLayout: 'embed', // sets the default layout
  handlebars   : Handlebars, // includes basic handlebars for access to that library
});
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');

// middleware to pass user info back to client (for handlebars access), if user is logged in
app.use(populateLocalsDotUser);

// start the server
const startServer = (mysqlConfig) => {
  const db = require('./models')(mysqlConfig); // require our models for syncing
  db.sequelize
    // sync sequelize
    .sync()
    // require routes
    .then(() => {
      require('./routes/auth-routes.js')(app);
      require('./routes/api-routes.js')(app);
      require('./routes/page-routes.js')(app);
      require('./routes/serve-routes.js')(app);
      require('./routes/fallback-routes.js')(app);
      const http = require('http');
      return http.Server(app);
    })
    // start the server
    .then(server => {
      server.listen(PORT, () => {
        logger.info('Trusting proxy?', app.get('trust proxy'));
        logger.info(`Server is listening on PORT ${PORT}`);
      });
    })
    .catch((error) => {
      logger.error(`Startup Error:`, error);
    });
};

module.exports = {
  hello () {
    console.log('hello world');
  },
  speak (something) {
    console.log(something);
  },
  start (config) {
    const { mysqlConfig } = config;
    startServer(mysqlConfig);
  },
};
