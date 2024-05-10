const pool= require("../../config/db")

module.exports= {
    getSubscriptionDetail: (userId,callback) =>{
        pool.query(
            `SELECT * FROM bill WHERE userId = ?`,
            [userId],
            (error,results,feilds)=>{
            if(error) callback(error)
            return callback(null,results)
        }
        )
    },

}