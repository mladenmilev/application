
"use strict";

var express   = require('express'),
    router    = express.Router(),
    validator = require('validator'),
    Promise   = require('bluebird'),
    moment    = require('moment'),
    _         = require('underscore'),
    uuid      = require('node-uuid'),
    EmailTransport = require('../email');


router.get('/change_password/', function (req, rsp) {
        console.info("GET " + req.baseUrl)
        rsp.render("user_change_password");
    });

module.exports = router;
