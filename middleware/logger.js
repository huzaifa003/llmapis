const logging = async (req, res, next) => {
    try {
      // Log the HTTP method, URL, headers, and body of the incoming request
      console.log(`Method: ${req.method}`);
      console.log(`URL: ${req.url}`);
      console.log('Headers:', req.headers);
  
      // Only log the body for non-GET requests
      if (req.method !== 'GET') {
        console.log('Body:', req.body);
      }
  
      // Send a response indicating that logging was completed
      next()
    } catch (error) {
      // Handle any errors that might occur
      res.status(500).json({ error: 'Failed to log request', details: error.message });
    }
  };
  
  export default logging;
  