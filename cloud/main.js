
// Use Parse.Cloud.define to define as many cloud functions as you want.
// For example:
var moment = require('./cloud/moment');
moment().format();
var numOfReminders = 4;
var pushCount = 0;
var prependZero = function(param) {
  if (String(param).length < 2) {
    return '0' + String(param);
  }
  return param;
};
var epochParser = function(val, opType) {
  if (val === null) {
    return '00:00';
  } else {
    var meridian = ['AM', 'PM'];

    if (opType === 'time') {
      var hours = parseInt(val / 3600);
      var minutes = Math.floor((val / 60) % 60);
      var hoursRes = hours > 12 ? (hours - 12) : hours;
      if (hoursRes === 0) {
        hoursRes = 12;
      }
      var currentMeridian = meridian[parseInt(hours / 12)];

      return (hoursRes + ':' + prependZero(minutes) + ' ' + currentMeridian);
    }
  }
};

var incrementPushCounter = function() {
  pushCount++;
}

var scheduleReminder = function(prescription, medication, iQuery) {
  console.log('Prescription: ' + medication.get('name'));
  var promises = [];
  var Reminders = Parse.Object.extend('Reminders');
  var reminder = null;
  var now = moment();
  var fiveMinutesFromNow = moment().add(5, 'minutes');
  for (var i = 1; i < numOfReminders; i++) {
    if (prescription.get('time' + i) > -1) {
      var userDate = moment(prescription.get('utc' + i)).utc();
      console.log('Send date: ' + moment(userDate).format('dddd, MMMM Do YYYY, h:mm a'));
      console.log('Local time: ' + epochParser(prescription.get('time' + i), 'time'));

      console.log('Reminder should be sent? : ' + userDate.isBetween(now, fiveMinutesFromNow));
      if (userDate.utc().isBetween(now.utc(), fiveMinutesFromNow.utc())) {
        Parse.Push.send({
          where: iQuery,
          data: {
            title: 'Vitalbeat',
            alert: medication.get('name') + ': ' + epochParser(prescription.get('time' + i), 'time')
          },
          push_time: userDate.utc().toDate()

        });
        userDate.add(1, 'd');
        //prescription.set('scheduled', true);
        prescription.set('utc' + i, userDate.utc().toDate());
        incrementPushCounter();
        promises.push(prescription.save());
      }
    }
  }

  return Parse.Promise.when(promises);
};

Parse.Cloud.define('testMoment', function(request, response) {
  var now = moment().utc();
  var fiveMinutesFromNow = moment().utc().add(5, 'minutes');
  var oneMinutesFromNow = moment().utc().subtract(1, 'minutes');
  response.success(now.isBetween(oneMinutesFromNow, fiveMinutesFromNow));
});

Parse.Cloud.define('test', function(request, response) {
  var Prescriptions = Parse.Object.extend('Prescriptions');
  var pQuery = new Parse.Query(Prescriptions);
  pQuery.get('1gd6fWwUtI').then(function(prescription) {
    scheduleReminder(prescription).then(function(result) {
      response.success(result);
    });
  });

});

// Parse.Cloud.afterSave('Prescriptions', function(request) {
//   console.log('A Prescription has just been saved...trying to schedule');
//   scheduleReminder(request.object);
// });

Parse.Cloud.job('sendPush', function(request, status) {
  var Prescriptions = Parse.Object.extend('Prescriptions');
  var Medications = Parse.Object.extend('Medications');
  var Reminders = Parse.Object.extend('Reminders');
  var Installations = Parse.Object.extend('Installations');
  var userQuery = new Parse.Query(Parse.User);
  pushCount = 0;

  userQuery.each(function(user) {
    console.log('Preparing notifications for: ' + user.get('first_name') + ' ' + user.get('last_name'));
    var ids = user.get('DeviceIDS');
    if (ids) {
      var iQuery = new Parse.Query(Installations);
      iQuery.containedIn('installationId', ids);
      return iQuery.find().then(function(results) {
        var userDate1 = null;
        var userDate2 = null;
        var userDate3 = null;
        var pQuery = new Parse.Query(Prescriptions);
        pQuery.equalTo('userId', user);
        pQuery.include(Medications);
        return pQuery.each(function(prescription) {
          userDate1 = prescription.get('utc1');
          userDate2 = prescription.get('utc2');
          userDate3 = prescription.get('utc3');
          var med = prescription.get('medicationId');
          return med.fetch().then(function(medication) {
            return scheduleReminder(prescription, medication, iQuery);
          });
        });
        // END iQuery
      });
    }
  }).then(function() {

    status.success('Sent ' + pushCount + ' reminders.');
  });
});
