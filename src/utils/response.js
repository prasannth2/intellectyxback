const successResponse = (
  res,
  message = "Success",
  data = {},
  statusCode = 200,
) => {
  return res.status(statusCode).json({
    status: 1,
    message,
    data,
  });
};

const errorResponse = (
  res,
  message = "Something went wrong",
  statusCode = 500,
) => {
  return res.status(statusCode).json({
    status: 0,
    message,
  });
};

module.exports = {
  successResponse,
  errorResponse,
};
