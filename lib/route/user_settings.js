
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


router.post('/user_change_password/', function(req, res){
      var user_id = validator.trim(req.param('user_id'));

      var new_user_attributes,
        employee,
        model = req.app.get('db_model');

      Promise.try(function(){
        ensure_user_id_is_integer({req : req, user_id : user_id});
      })
      .then(function(){
        return req.user.get_company_for_user_details({
          user_id : user_id,
        });
      })
      .then(function(company){

        new_user_attributes = get_and_validate_user_parameters({
          req         : req,
          item_name   : 'user',
          departments : company.departments,
        });

        if (new_user_attributes.password) {
          new_user_attributes.password = model.User.hashify_password(
            new_user_attributes.password
          );
        }

        employee = company.users[0];

        return Promise.resolve();
      })

      // Ensure that new email if it was changed is not used anywhere else
      // withing system
      .then(function(){ return ensure_email_is_not_used_elsewhere({
        employee            : employee,
        new_user_attributes : new_user_attributes,
        req                 : req,
        model               : model,
      })})

      // Double check user in case it is re-activated
      .then(function(){ return ensure_user_was_not_useed_elsewhere_while_being_inactive({
        employee            : employee,
        new_user_attributes : new_user_attributes,
        req                 : req,
        model               : model,
      })})

      .then(function(){ return ensure_we_are_not_removing_last_admin({
        employee            : employee,
        new_user_attributes : new_user_attributes,
        req                 : req,
        model               : model,
      })})

      // All validations are passed: update database
      .then(function(){

        employee.updateAttributes(new_user_attributes).then(function(){
          req.session.flash_message(
            'Details for '+employee.full_name()+' were updated'
          );
          return res.redirect_with_session(req.body.back_to_absences ? './absences/' : '.');
        });
      })

      .catch(function(error){
        console.error(
          'An error occurred when trying to save chnages to user account by user '+req.user.id
          + ' : ' + error
        );

        req.session.flash_error(
          'Failed to change password.'
        );

        return res.redirect_with_session(req.body.back_to_absences ? './absences/' : '.');
      });
    });


// TODO this script is doubled with users_admin.js


// Special step performed while saving existing employee accont details
//
// In case when employee had "end date" populated and now it is going
// to be updated to be in future - check if during the time user was inactive
// new user was added (including other companies)
//
var ensure_user_was_not_useed_elsewhere_while_being_inactive = function(args){
  var
    employee            = args.employee,
    new_user_attributes = args.new_user_attributes,
    req                 = args.req,
    model               = args.model;

  if (
    // Employee has end_date defined
    employee.end_date &&
    (
     ! new_user_attributes.end_date
     ||
      (
        // new "end_date" is provided
        // new "end_date" is in future
        new_user_attributes.end_date &&
        moment( new_user_attributes.end_date ).startOf('day').toDate() >= moment().startOf('day').toDate()
      )
    )
  ) {
    return model.User.find_by_email(new_user_attributes.email)
      .then(function(user){

        if (user && user.companyId !== employee.companyId) {
          var error_msg = 'There is an active account with similar email somewhere within system.';
          req.session.flash_error(error_msg);
          throw new Error(error_msg);
        }

        return Promise.resolve();
      });
  }

  return Promise.resolve();
};

// Extra step: in case when employee is going to have new email,
// check that it is not duplicated
//
var ensure_email_is_not_used_elsewhere = function(args){
  var
    employee            = args.employee,
    new_user_attributes = args.new_user_attributes,
    req                 = args.req,
    model               = args.model;

  if (new_user_attributes.email === employee.email) {
    return Promise.resolve();
  }

  return model.User
    .find_by_email(new_user_attributes.email)
    .then(function(user){

      if (user) {
        req.session.flash_error('Email is already in use');
        throw new Error('Email is already used');
      }

      return Promise.resolve();
    });
};

var ensure_we_are_not_removing_last_admin = function(args){
  var
    employee            = args.employee,
    new_user_attributes = args.new_user_attributes,
    req                 = args.req,
    model               = args.model;

  if (
    // It is about to change admin rights
    new_user_attributes.admin !== employee.admin
    // and it is revoking admin rights
    && ! new_user_attributes.admin
  ) {
    return model.User
      .count({ where : {
        companyId : employee.companyId,
        id        : { $ne : employee.id},
        admin     : true,
      }})
      .then(function(number_of_admins_to_be_left){
        if (number_of_admins_to_be_left > 0) {
          return Promise.resolve();
        }

        req.session.flash_error('This is last admin witihn company. Cannot revoke admin rights.');
        throw new Error('Attempt to revoke admin rights from last admin in comapny '+employee.companyId);
      });
  }

  return Promise.resolve();
};



function ensure_user_id_is_integer(args){
        var req     = args.req,
            user_id = args.user_id;

        if (! validator.isInt(user_id)){
            throw new Error(
              'User '+req.user.id+' tried to edit user with non-integer ID: '+user_id
            );
        }

        return;
    }

module.exports = router;
