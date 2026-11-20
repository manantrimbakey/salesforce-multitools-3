# Writes seeded permission set XML (Cx_*) for the scenario checks. usage: python3 gen.py <sfdxProjectDir>
import random, json, os
random.seed(20261120)
import sys
D=sys.argv[1].rstrip('/')+'/force-app/main/default/'
os.makedirs(D+'permissionsets',exist_ok=True)
NS='xmlns="http://soap.sforce.com/2006/04/metadata"'
cx=lambda n,p:[f'{p}{i}__c' for i in range(1,n+1)]
OBJS={'Account':['Industry','Phone','Website','Type','Rating']+cx(12,'Cxs_F'),
      'Contact':['Email','Phone','Title']+cx(12,'Cxs_F')}
for o in range(1,6): OBJS[f'Cx_Obj{o}__c']=cx(15,'Cx_F')
def close(f):
    f=dict(f)
    if f.get('modifyAll'): f.update(viewAll=True,edit=True,delete=True)
    if f.get('delete'): f['edit']=True
    if any(f.get(k) for k in ('create','edit','delete','viewAll','viewAllFields','modifyAll')): f['read']=True
    return f
def rand_spec():
    spec={'objects':{},'fields':{}}
    for o in random.sample(list(OBJS),random.randint(1,5)):
        f={k:random.random()<0.35 for k in ('create','edit','delete','viewAll','modifyAll','viewAllFields')}
        f['read']=random.random()<0.7
        f=close(f)
        if not f.get('read'): f['read']=True
        spec['objects'][o]=f
        for fld in random.sample(OBJS[o],random.randint(0,min(len(OBJS[o]),12))):
            e=random.random()<0.4; r=e or random.random()<0.8
            spec['fields'][f'{o}.{fld}']={'read':r,'edit':e}
    return spec
def b(x): return 'true' if x else 'false'
def xml(name,spec):
    parts=[]
    fl=''.join(f'    <fieldPermissions><editable>{b(v["edit"])}</editable><field>{k}</field><readable>{b(v["read"])}</readable></fieldPermissions>\n' for k,v in spec['fields'].items())
    ob=''.join(f'    <objectPermissions><allowCreate>{b(f.get("create"))}</allowCreate><allowDelete>{b(f.get("delete"))}</allowDelete><allowEdit>{b(f.get("edit"))}</allowEdit><allowRead>{b(f.get("read"))}</allowRead><modifyAllRecords>{b(f.get("modifyAll"))}</modifyAllRecords><object>{o}</object><viewAllFields>{b(f.get("viewAllFields"))}</viewAllFields><viewAllRecords>{b(f.get("viewAll"))}</viewAllRecords></objectPermissions>\n' for o,f in spec['objects'].items())
    extra=spec.get('extra','')
    open(f'{D}permissionsets/{name}.permissionset-meta.xml','w').write(f'<?xml version="1.0" encoding="UTF-8"?>\n<PermissionSet {NS}>\n    <hasActivationRequired>false</hasActivationRequired>\n    <label>{name}</label>\n{fl}{ob}{extra}</PermissionSet>\n')
specs={}
# hand-crafted hard cases
def hc(name,objs,fields):
    specs[name]={'objects':{o:close(f) for o,f in objs.items()},'fields':fields}
R=lambda r=True,e=False:{'read':r,'edit':e}
hc('Cx_H01_A',{'Account':{'viewAllFields':True},'Contact':{'read':True},'Cx_Obj1__c':{'viewAllFields':True,'modifyAll':True}},{'Contact.Email':R(1,1),'Contact.Phone':R(1,0),'Cx_Obj1__c.Cx_F1__c':R(1,1)})
hc('Cx_H01_B',{'Account':{'read':True},'Contact':{'viewAllFields':True},'Cx_Obj1__c':{'read':True,'edit':True}},{'Account.Industry':R(1,0),'Account.Phone':R(1,1),'Cx_Obj1__c.Cx_F1__c':R(1,0)})
hc('Cx_H02_A',{'Account':{'viewAllFields':True,'viewAll':True}},{'Account.Industry':R(1,1)})
hc('Cx_H02_B',{'Account':{'read':True}},{'Account.Industry':R(1,0),'Account.Phone':R(1,0)})
hc('Cx_H03_A',{'Account':{'viewAllFields':True}},{})
hc('Cx_H03_B',{'Account':{'viewAllFields':True}},{'Account.Industry':R(1,0),'Account.Phone':R(1,0)})
# many fields: A VAF only, B read + edit on 40 fields
acc=[f'Cxs_F{i}__c' for i in range(1,13)]+['Type','Phone','Fax','AccountNumber','Website','Sic','Industry','AnnualRevenue','NumberOfEmployees','Ownership','TickerSymbol','Description','Rating','Site','AccountSource','Tradestyle','NaicsCode','NaicsDesc','YearStarted','SicDesc']
hc('Cx_H04_A',{'Account':{'viewAllFields':True}},{})
hc('Cx_H04_B',{'Account':{'read':True}},{f'Account.{f}':R(1,1) for f in acc})
for i in range(1,17):
    specs[f'Cx_F{i:02d}_A']=rand_spec(); specs[f'Cx_F{i:02d}_B']=rand_spec()
for n,s in specs.items(): xml(n,s)
json.dump(specs,open(__import__('os').path.join(__import__('os').path.dirname(__file__),'specs.json'),'w'),indent=1)
print(len(specs),'sets')
