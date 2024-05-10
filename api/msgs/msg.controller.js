const { getSubscriptionDetail } =require('./msg.service')

module.exports={
    getSubscriptionDetail: (req,res)=>{
        const userId=req.query.email;
        getSubscriptionDetail(userId,(err,result)=>{
            if (err){
                console.log(err)
                return res.status(500).json({
                    success:0,
                    message:"database connection error"
                })
            }
            if(!result || result.length===0){
                return res.json({
                    success:0,
                    message:"no mess found for this user"
                })
            }
            return res.json({
                success:1,
                data: result
            })
            
        })
    }
}