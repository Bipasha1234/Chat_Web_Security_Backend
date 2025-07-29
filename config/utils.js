const jwt =require( "jsonwebtoken");

 const generateToken = (userId, res) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.cookie("jwt", token, {
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true, //prevent
  sameSite: "none", // allows cross-site cookie
  secure: true, // must be true when sameSite is 'none'
});


  return token;
};

module.exports=generateToken;