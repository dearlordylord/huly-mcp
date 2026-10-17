module resident_response_ownership_test {
  import resident_response_ownership.* from "./resident-response-ownership"

  run independentCallbacksTest = init
    .then(observeResult(0, OwnReply, true))
    .then(observeResult(1, OwnReply, true))
    .expect(independent_replies and safety)

  run duplicateReplyTest = init
    .then(observeResult(0, OwnReply, true))
    .then(observeResult(0, OwnReply, false))
    .expect(responses.get(0).phase == Failed and responses.get(0).accepted == 1 and safety)

  run foreignReplyTest = init
    .then(observeResult(0, ForeignReply, false))
    .expect(responses.get(0).phase == Failed and responses.get(0).accepted == 0 and safety)

  run missingReplyTest = init
    .then(observeResult(0, Progress, true))
    .then(observeResult(0, End, false))
    .expect(responses.get(0).phase == Failed and safety)

  run completedReplyTest = init
    .then(observeResult(0, Progress, true))
    .then(observeResult(0, OwnReply, true))
    .then(observeResult(0, End, true))
    .expect(responses.get(0).phase == Closed and safety)

  run rejectedCallbackStopsTest = init
    .then(observeResult(0, ForeignReply, false))
    .then(observeResult(0, OwnReply, true).fail())
}
