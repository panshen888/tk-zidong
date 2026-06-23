# Miaoshou Skill API Record

Updated: 2026-06-11

This file records the Miaoshou official skill APIs that are relevant to the AI listing workflow. Purchase APIs are intentionally out of scope.

Official Apifox verification source:

- https://s.apifox.cn/fd54e57e-9b98-4c34-bada-306221c39e68/api-446814596

## Scope

Listing workflow only:

1. Import source product link into Miaoshou common collect box.
2. Read common collect box product data.
3. Claim product into TikTok collect box.
4. Read and edit TikTok collect box product data.
5. Read category, warehouse, manufacturer, and responsible person data for publish readiness.
6. Keep final publish as a manual confirmation step for the first version.

## Skill APIs

| Skill | Endpoint | Type | Returned values | Listing usage |
| --- | --- | --- | --- | --- |
| `miaoshou-erp-source-import` | `/open/v1/product/common_collect_box/common_collect_box/fetch_item` | write/action | `sourceItemIdAndDetailIdMap` | Import source links and get common collect box detail IDs. |
| `miaoshou-erp-common-collectbox-manage` | `/open/v1/product/common_collect_box/common_collect_box/get_common_collect_box_list` | read | `commonCollectBoxDetailId`, `itemNum`, `title`, `thumbnail`, `price`, `minSkuPrice`, `maxSkuPrice`, `stock`, `status`, `reason`, `weight`, `sourceList` | Check whether collection succeeded and locate common collect box records. |
| `miaoshou-erp-common-collectbox-manage` | `/open/v1/product/common_collect_box/common_collect_box/get_common_collect_box_detail` | read | `title`, `notesText`, `notes`, `price`, `stock`, `weight`, `imgUrls`, `sourceAttrs`, `colorMap`, `sizeMap`, `skuMap`, `packageLength`, `packageWidth`, `packageHeight`, `sizeChart`, `mainImgVideoUrl`, `productCertifications`, `sourceList`, `ossMd5` | Read collected title, description, images, SKU, price, weight, and dimensions. |
| `miaoshou-erp-common-collectbox-manage` | `/open/v1/product/common_collect_box/common_collect_box/add_common_collect_box_detail` | write/action | `commonCollectBoxDetailId` | Backup route: create common collect box product from local data. |
| `miaoshou-erp-common-collectbox-manage` | `/open/v1/product/common_collect_box/common_collect_box/edit_common_collect_box_detail` | write/action | new `ossMd5` | Edit common collect box data before claim if needed. |
| `miaoshou-erp-common-collectbox-manage` | `/open/v1/product/common_collect_box/common_collect_box/batch_delete_common_collect_box_detail` | write/action | success/failure status | Clean wrong imported products. |
| `miaoshou-erp-product-claim` | `/open/v1/product/common_collect_box/common_collect_box/claimed` | write/action | `platformCollectBoxDetailIdMap` | Claim common collect box product into TikTok platform collect box. |
| `miaoshou-erp-shop-query` | `/open/v1/product/shop/shop/get_shop_list` | read | `shopId`, `site`, `siteName`, `shopNick`, `platform`, `isCb`, `isCnsc`, `status`, `gmtExpire`, `gmtLastAuth` | Select configured TikTok shop and site. |
| `miaoshou-erp-tiktok-category-recommend` | `/open/v1/product/collect_box/tiktok/collect_box/get_category_tree_by_site` | read | `cid`, `aid`, `fid`, `name`, `nameChinese`, `isLastLevel`, `disabled`, `children` | Recommend and validate TikTok leaf category. |
| `miaoshou-erp-tiktok-category-recommend` | `/open/v1/product/collect_box/tiktok/collect_box/get_category_metadata` | read | `categoryConfig`, `categorySaleAttrList`, `categoryProductAttrList`, required certification/config flags | Read required category attributes and compliance fields. |
| `miaoshou-erp-tiktok-product-edit` | `/open/v1/product/collect_box/tiktok/collect_box/search_collect_box_detail_list` | read | `collectBoxDetailId`, `itemNum`, `stock`, `price`, `thumbnail`, `title`, `status`, `editModel`, `commonCollectBoxDetailId`, `platform`, `collectBoxDetailShopList` | Find TikTok collect box records that need editing. |
| `miaoshou-erp-tiktok-product-edit` | `/open/v1/product/collect_box/tiktok/collect_box/get_shop_collect_item_info` | read | `ossMd5`, `editModel`, `claimToShopIds`, `shopCollectItemInfo` with title, description, images, category, weight, package size, SKU properties, `skuMap.price`, `skuMap.priceIncludeVat`, `skuMap.originPrice`, stock, SKU weight, warehouse stock, attributes, certifications | Core read API for shop-mode product editing and price/weight inspection. |
| `miaoshou-erp-tiktok-product-edit` | `/open/v1/product/collect_box/tiktok/collect_box/save_shop_collect_item_info` | write/action | new `ossMd5` | Save shop-mode title, description, category, attributes, price, SKU, weight, dimensions, images after confirmation. |
| `miaoshou-erp-tiktok-product-edit` | `/open/v1/product/collect_box/tiktok/collect_box/get_site_collect_item_info` | read | `ossMd5`, `siteCollectItemInfo`, `collectBoxDetailShopList` | Core read API for site-mode product editing across shops. |
| `miaoshou-erp-tiktok-product-edit` | `/open/v1/product/collect_box/tiktok/collect_box/save_site_collect_item_info` | write/action | new `ossMd5` | Save site-mode title, description, category, attributes, price, SKU, weight, dimensions, images after confirmation. |
| `miaoshou-erp-tiktok-product-edit` | `/open/v1/product/collect_box/tiktok/collect_box/claim_to_shop` | write/action | success/failure status | Claim TikTok collect box products to target shop before editing/publishing. |
| `miaoshou-erp-tiktok-product-edit` | `/open/v1/product/collect_box/tiktok/collect_box/get_shop_warehouse_list` | read | `shopWarehouseList`, `warehouseId`, `warehouseName`, `warehouseSubType`, `warehouseEffectStatus`, `isDefault`, `inventoryRule` | Fill or validate warehouse and stock mapping. |
| `miaoshou-erp-tiktok-product-edit` | `/open/v1/product/collect_box/tiktok/collect_box/get_manufacturer_list` | read | `manufacturerList.id`, `manufacturerList.name` | Fill manufacturer when category/site requires it. |
| `miaoshou-erp-tiktok-product-edit` | `/open/v1/product/collect_box/tiktok/collect_box/get_responsible_person_list` | read | `responsiblePersonList.id`, `responsiblePersonList.name` | Fill EU responsible person when required. |
| `miaoshou-erp-tiktok-product-publish` | `/open/v1/product/collect_box/tiktok/collect_box/get_category_tree_by_site` | read | category tree | Publish-readiness category validation. |
| `miaoshou-erp-tiktok-product-publish` | `/open/v1/product/collect_box/tiktok/collect_box/get_category_metadata` | read | category requirements | Publish-readiness required-field validation. |
| `miaoshou-erp-tiktok-product-publish` | `/open/v1/product/collect_box/tiktok/collect_box/get_shop_warehouse_list` | read | warehouse list | Publish-readiness warehouse validation. |
| `miaoshou-erp-tiktok-product-publish` | `/open/v1/product/collect_box/tiktok/collect_box/get_responsible_person_list` | read | responsible person list | Publish-readiness compliance validation. |
| `miaoshou-erp-tiktok-product-publish` | `/open/v1/product/collect_box/tiktok/collect_box/claim_to_shop` | write/action | success/failure status | Claim to shop as pre-publish action. |
| `miaoshou-erp-tiktok-product-publish` | `/open/v1/product/collect_box/tiktok/collect_box/save_move_collect_task` | write/action | success/failure status | Final publish action. First version should not call this automatically. |

## Official Apifox Product API Check

The official Apifox document currently exposes these product/listing APIs. They match the listing-related skill records above:

| Apifox title | Endpoint | Present in record |
| --- | --- | --- |
| 通过货源链接采集货源 | `/open/v1/product/common_collect_box/common_collect_box/fetch_item` | yes |
| 创建公共采集箱产品 | `/open/v1/product/common_collect_box/common_collect_box/add_common_collect_box_detail` | yes |
| 获取公共采集箱列表 | `/open/v1/product/common_collect_box/common_collect_box/get_common_collect_box_list` | yes |
| 编辑公共采集箱产品 | `/open/v1/product/common_collect_box/common_collect_box/edit_common_collect_box_detail` | yes |
| 获取公共采集箱详情 | `/open/v1/product/common_collect_box/common_collect_box/get_common_collect_box_detail` | yes |
| 批量删除公共采集箱产品 | `/open/v1/product/common_collect_box/common_collect_box/batch_delete_common_collect_box_detail` | yes |
| 认领到平台采集箱 | `/open/v1/product/common_collect_box/common_collect_box/claimed` | yes |
| 获取类目列表 | `/open/v1/product/collect_box/tiktok/collect_box/get_category_tree_by_site` | yes |
| 获取类目属性信息 | `/open/v1/product/collect_box/tiktok/collect_box/get_category_metadata` | yes |
| 获取店铺仓库列表 | `/open/v1/product/collect_box/tiktok/collect_box/get_shop_warehouse_list` | yes |
| 获取欧盟责任人列表 | `/open/v1/product/collect_box/tiktok/collect_box/get_responsible_person_list` | yes |
| 认领预发布店铺 | `/open/v1/product/collect_box/tiktok/collect_box/claim_to_shop` | yes |
| 获取采集箱列表 | `/open/v1/product/collect_box/tiktok/collect_box/search_collect_box_detail_list` | yes |
| 获取采集箱店铺模式详情 | `/open/v1/product/collect_box/tiktok/collect_box/get_shop_collect_item_info` | yes |
| 保存采集箱店铺模式详情 | `/open/v1/product/collect_box/tiktok/collect_box/save_shop_collect_item_info` | yes |
| 获取采集箱站点模式详情 | `/open/v1/product/collect_box/tiktok/collect_box/get_site_collect_item_info` | yes |
| 保存采集箱站点模式详情 | `/open/v1/product/collect_box/tiktok/collect_box/save_site_collect_item_info` | yes |
| 发布产品 | `/open/v1/product/collect_box/tiktok/collect_box/save_move_collect_task` | yes |
| 获取店铺数据列表 | `/open/v1/product/shop/shop/get_shop_list` | yes |

Note: `get_manufacturer_list` is present in the installed `miaoshou-erp-tiktok-product-edit` skill, but it was not visible in the checked Apifox sidebar at the time of this review. Keep it as a skill-supported candidate API until live credentials verify whether the endpoint is enabled.

## Official Shop Query Values

`/open/v1/product/shop/shop/get_shop_list` official request fields:

| Field | Type | Required | Official note |
| --- | --- | --- | --- |
| `platform` | string | yes | `tiktok` for TikTok normal shop, `tiktokGlobal` for TikTok global shop |
| `site` | string | yes | `ID`, `VN`, `TH`, `MY`, `PH`, `BR`, `MX`, `ES`, `FR`, `GB`, `TIKTOKGLOBAL`, `TIKTOKGLOBALUS`, `TIKTOKGLOBALEU`, `US`, `DE`, `IT`, `JP` |
| `pageNo` | integer | yes | current page, `>= 1` |
| `pageSize` | integer | yes | page size, `<= 100` |

The official enum differs from some local skill examples: use `GB` rather than `UK`, and support `tiktokGlobal` plus global site codes when needed.

## Official Extra Fulfillment APIs

These APIs exist in the same official Apifox document but are not part of the current AI listing module. They should be recorded separately for a future fulfillment/logistics card, not mixed into first-version listing.

| Apifox title | Endpoint | Type | Returned / useful values | Current usage |
| --- | --- | --- | --- | --- |
| 获取当前账号有效的线下物流列表 | `/open/v1/order/logistics_agent/manage/get_enable_offline_product_list` | read | `logisticsAgentAuthConfigOption`, `logisticsAgentAuthId`, `logisticsAgentProductId`, `logisticsAgentId`, `logisticsAgentWarehouseId`, `logisticsAgentWarehouseName`, `logisticsAgentCustomerId` | future fulfillment/logistics config |
| 获取当前包裹有效的线上物流列表 | `/open/v1/order/logistics_agent/manage/get_enable_online_product_list` | read | `logisticsAgentAuthConfigOption`, `logisticsAgentAuthId`, `logisticsAgentProductId`, `logisticsCompany`, `fee`, last-mile option info | future fulfillment/logistics selection |
| 申请运单号 | `/open/v1/order/package/logistics/tracking_no/apply` | write/action | `logisticsNo`, `logisticsType` | future shipping workflow |
| 获取运单面单 | `/open/v1/order/package/logistics/waybill/get_waybill` | read/action | `logisticsNo`, `logisticsCompany`, `logisticsAgentAuthId`, `logisticsAgentProductId`, `logisticsAgentId`, waybill data | future shipping workflow |
| 设置包裹物流 | `/open/v1/order/package/logistics/tracking_no/save_logistics_agent_product` | write/action | logistics number/company/auth/product IDs | future shipping workflow |
| 保存包裹本地备注 | `/open/v1/order/package/base_info_modify/saveOrderPackageAppNote` | write/action | updated package/order IDs | future order/package notes |
| 保存包裹商家备注 | `/open/v1/order/package/base_info_modify/saveSellerNote` | write/action | `sellerNoteMap` | future order/package notes |
| 获取包裹详情 | `/open/v1/order/package/fetch/get_package_info` | read | `orderPackageInfo`, shop/site info, order info, logistics product info, shipping fee, warehouse name, fulfillment type | future package status lookup |
| 批量获取包裹列表 | `/open/v1/order/package/fetch/search_package_list` | read | `orderPackageList`, shop/site info, order amount, seller note, logistics product info | future package status lookup |
| 包裹发货 | `/open/v1/order/package/ship_package/ship_packages` | write/action | `shipFailErrors` | future final ship action |

## Key Values For Listing

| Business value | Preferred source |
| --- | --- |
| TikTok collect box product ID | `search_collect_box_detail_list.collectBoxDetailId` |
| Common collect box product ID | `fetch_item.sourceItemIdAndDetailIdMap` or `get_common_collect_box_list.commonCollectBoxDetailId` |
| Title | `get_common_collect_box_detail.title`, then `get_shop_collect_item_info.shopCollectItemInfo.title` |
| Description/detail page | `notes` / `notesText` |
| Main images | `imgUrls` |
| SKU image | `skuPropertyList[].attrValueList[].imgUrl` |
| SKU sale price | `skuMap[].price` |
| Local displayed/VAT price | `skuMap[].priceIncludeVat` |
| Source/origin price | `skuMap[].originPrice` |
| Stock | `stock`, `skuMap[].stock` |
| Product weight | `weight` |
| SKU weight | `skuMap[].weight` |
| Package dimensions | `packageLength`, `packageWidth`, `packageHeight` |
| Category ID | `cid` |
| Required category attributes | `categoryProductAttrList`, `categorySaleAttrList` |
| Warehouse | `get_shop_warehouse_list.shopWarehouseList[].warehouseList[]` |
| Save conflict token | `ossMd5` from latest detail API |

## Current Software Gap

Already wired in the app:

- `get_shop_list`
- `fetch_item`
- `add_common_collect_box_detail`
- `claimed`
- `search_collect_box_detail_list`
- `get_category_metadata`
- `get_shop_warehouse_list`

Need to add for a real listing edit loop:

- `get_common_collect_box_detail`
- `get_shop_collect_item_info`
- `save_shop_collect_item_info`
- `get_site_collect_item_info`
- `save_site_collect_item_info`
- `get_category_tree_by_site`
- `get_manufacturer_list`
- `get_responsible_person_list`

## First Version Boundary

- Do not call final publish automatically.
- Do not auto-save AI-generated title/detail/category without human confirmation.
- Use Miaoshou detail APIs to read, diagnose, and prepare data.
- Let the operator review and publish in Miaoshou.
