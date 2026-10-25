"""Interoperability test driver; requires the existing developer SDK, not used by the demo."""
import json,sys
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from covenant_agent import open_work as p
from covenant_agent.codec import public_key,digest

value=json.load(sys.stdin)
if value['action']=='verify':
    print(json.dumps([p.inspect(order,order['id']) for order in value['agreements']]))
elif value['action']=='make':
    customer,provider=Ed25519PrivateKey.generate(),Ed25519PrivateKey.generate()
    payment=p.rail('MANUAL','demo-only','demo-credit','credits',public_key(provider))
    order=p.draft('SYNTHETIC: provide three sources and a cost comparison.',public_key(customer),public_key(provider),90,payment,'a'*64,1900000000)
    order=p.assent(order,customer,order['id']);order=p.assent(order,provider,order['id'])
    order=p.event(order,provider,'DELIVERY_CLAIM','b'*64,1800000000,order['id'])
    order=p.event(order,customer,'DISPUTE','c'*64,1800000001,order['id'])
    print(json.dumps(order))
else:raise ValueError('ACTION')
