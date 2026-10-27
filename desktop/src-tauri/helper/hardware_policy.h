#ifndef PINWALL_HARDWARE_POLICY_H
#define PINWALL_HARDWARE_POLICY_H
#include <stdbool.h>
#include <math.h>
// Safety policy is shared with synthetic tests. Never reduce the OS's current fan speed.
static bool PWFanPolicy(unsigned fan,unsigned count,double rpm,double minimum,double maximum,double current,double temperature,bool ac,int thermal,unsigned seconds){
 return count>0&&count<=4&&fan<count&&isfinite(rpm)&&isfinite(minimum)&&isfinite(maximum)&&isfinite(current)&&isfinite(temperature)&&minimum>=0&&maximum>minimum&&maximum<=12000&&current>=0&&current<=maximum&&rpm>=fmax(1000,fmax(minimum,current))&&rpm<=maximum&&temperature>0&&temperature<60&&ac&&thermal<2&&seconds>=15&&seconds<=300;
}
static bool PWLidPolicy(bool hasLid,bool alreadyDisabled,bool ac,int thermal,double temperature,unsigned seconds){return hasLid&&!alreadyDisabled&&ac&&thermal<2&&isfinite(temperature)&&temperature>0&&temperature<60&&seconds>=15&&seconds<=300;}
static bool PWLeaseExpired(double time,double lease,double deadline,bool ac,int thermal,double temperature){return !isfinite(time)||time>=deadline||time>=lease||!ac||thermal>=2||!isfinite(temperature)||temperature<=0||temperature>=75;}
#endif
