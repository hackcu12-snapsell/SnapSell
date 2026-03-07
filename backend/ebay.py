import os
import requests
import xml.etree.ElementTree as ET

SANDBOX_URL = "https://api.sandbox.ebay.com/ws/api.dll"
COMPATIBILITY_LEVEL = "967"
SITE_ID = "0"  # US
NS = "urn:ebay:apis:eBLBaseComponents"

CONDITION_MAP = {
    "New": "1000",
    "Like New": "2750",
    "Good": "3000",
    "Fair": "4000",
    "Poor": "7000",
}


def _headers(call_name: str, multipart: bool = False) -> dict:
    headers = {
        "X-EBAY-API-CALL-NAME": call_name,
        "X-EBAY-API-SITEID": SITE_ID,
        "X-EBAY-API-COMPATIBILITY-LEVEL": COMPATIBILITY_LEVEL,
        "X-EBAY-API-APP-NAME": os.environ["EBAY_APP_ID"],
        "X-EBAY-API-DEV-NAME": os.environ["EBAY_DEV_ID"],
        "X-EBAY-API-CERT-NAME": os.environ["EBAY_CERT_ID"],
    }
    if not multipart:
        headers["Content-Type"] = "text/xml"
    return headers


def upload_image(image_bytes: bytes, mime_type: str, name: str = "item-image") -> str:
    """Upload an image to eBay Picture Services. Returns the hosted image URL."""
    xml = f"""<?xml version="1.0" encoding="utf-8"?>
<UploadSiteHostedPicturesRequest xmlns="{NS}">
  <RequesterCredentials>
    <eBayAuthToken>{os.environ["EBAY_USER_TOKEN"]}</eBayAuthToken>
  </RequesterCredentials>
  <PictureName>{name}</PictureName>
</UploadSiteHostedPicturesRequest>"""

    files = [
        ("XML Payload", ("XML Payload", xml.encode("utf-8"), "text/xml")),
        ("image", ("image", image_bytes, mime_type)),
    ]
    resp = requests.post(
        SANDBOX_URL,
        files=files,
        headers=_headers("UploadSiteHostedPictures", multipart=True),
    )
    resp.raise_for_status()

    ns = {"e": NS}
    root = ET.fromstring(resp.text)
    ack = root.findtext("e:Ack", namespaces=ns)
    if ack != "Success":
        errors = [e.findtext("e:LongMessage", namespaces=ns)
                  for e in root.findall("e:Errors", namespaces=ns)]
        raise ValueError(f"Image upload failed: {errors}")

    url = root.findtext(".//e:FullURL", namespaces=ns)
    if not url:
        raise ValueError("No URL returned from eBay image upload")
    return url


def _build_item_specifics(specifics: dict) -> str:
    if not specifics:
        return ""
    lines = ["<ItemSpecifics>"]
    for name, value in specifics.items():
        lines.append(f"""  <NameValueList>
    <Name>{name}</Name>
    <Value>{value}</Value>
  </NameValueList>""")
    lines.append("</ItemSpecifics>")
    return "\n".join(lines)


def _build_picture_details(image_urls: list) -> str:
    if not image_urls:
        return ""
    urls = "\n".join(f"  <PictureURL>{url}</PictureURL>" for url in image_urls[:12])
    return f"<PictureDetails>\n{urls}\n</PictureDetails>"


def _build_xml(call_name: str, title: str, description: str, price: float,
               category_id: str, condition: str, item_specifics: dict,
               image_urls: list) -> str:
    condition_id = CONDITION_MAP.get(condition, "3000")
    specifics_xml = _build_item_specifics(item_specifics)
    pictures_xml = _build_picture_details(image_urls)
    return f"""<?xml version="1.0" encoding="utf-8"?>
<{call_name}Request xmlns="{NS}">
  <RequesterCredentials>
    <eBayAuthToken>{os.environ["EBAY_USER_TOKEN"]}</eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    <Title>{title[:80]}</Title>
    <Description>{description}</Description>
    <PrimaryCategory>
      <CategoryID>{category_id}</CategoryID>
    </PrimaryCategory>
    <StartPrice>{price:.2f}</StartPrice>
    <CategoryMappingAllowed>true</CategoryMappingAllowed>
    <ConditionID>{condition_id}</ConditionID>
    <Country>US</Country>
    <Currency>USD</Currency>
    <DispatchTimeMax>3</DispatchTimeMax>
    <ListingDuration>GTC</ListingDuration>
    <ListingType>FixedPriceItem</ListingType>
    <Quantity>1</Quantity>
    {specifics_xml}
    {pictures_xml}
    <ReturnPolicy>
      <ReturnsAcceptedOption>ReturnsAccepted</ReturnsAcceptedOption>
      <RefundOption>MoneyBack</RefundOption>
      <ReturnsWithinOption>Days_30</ReturnsWithinOption>
      <ShippingCostPaidByOption>Buyer</ShippingCostPaidByOption>
    </ReturnPolicy>
    <ShippingDetails>
      <ShippingType>Flat</ShippingType>
      <ShippingServiceOptions>
        <ShippingServicePriority>1</ShippingServicePriority>
        <ShippingService>USPSMedia</ShippingService>
        <ShippingServiceCost>2.50</ShippingServiceCost>
      </ShippingServiceOptions>
    </ShippingDetails>
    <Site>US</Site>
    <PostalCode>80301</PostalCode>
  </Item>
</{call_name}Request>"""


def _parse_response(xml_text: str) -> dict:
    ns = {"e": NS}
    root = ET.fromstring(xml_text)

    ack = root.findtext("e:Ack", namespaces=ns)
    item_id = root.findtext("e:ItemID", namespaces=ns)

    errors = []
    for err in root.findall("e:Errors", namespaces=ns):
        errors.append({
            "severity": err.findtext("e:SeverityCode", namespaces=ns),
            "message": err.findtext("e:LongMessage", namespaces=ns),
        })

    fees = {}
    for fee in root.findall(".//e:Fees/e:Fee", namespaces=ns):
        name = fee.findtext("e:Name", namespaces=ns)
        value_el = fee.find("e:Fee", namespaces=ns)
        if name and value_el is not None:
            fees[name] = value_el.text

    return {"ack": ack, "item_id": item_id, "fees": fees, "errors": errors}


def post_listing(title: str, description: str, price: float,
                 category_id: str, condition: str,
                 item_specifics: dict = None, image_urls: list = None,
                 verify: bool = True) -> dict:
    """
    Post or verify a listing on eBay sandbox via Trading API.
    verify=True  -> VerifyAddItem (dry run, no listing created)
    verify=False -> AddItem (creates a real sandbox listing)
    item_specifics: dict of {name: value} pairs required by the category
    """
    call_name = "VerifyAddItem" if verify else "AddItem"
    xml_body = _build_xml(call_name, title, description, price, category_id,
                          condition, item_specifics or {}, image_urls or [])
    resp = requests.post(SANDBOX_URL, data=xml_body.encode("utf-8"), headers=_headers(call_name))
    resp.raise_for_status()
    return _parse_response(resp.text)
