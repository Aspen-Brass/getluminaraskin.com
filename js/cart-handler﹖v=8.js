/**
 * Cart Handler for luminara Skincare
 * Manages cart operations for adding, removing, and updating products
 */
class CartHandler {
    constructor() {
        // Initialize cart from localStorage or create empty cart
        this.cart = JSON.parse(localStorage.getItem('luminaraCart')) || [];
        this.subtotal = 0;
        this.couponStorageKey = 'luminaraCheckoutCoupon';
        this.appliedCoupon = this.loadCouponFromStorage();
        this.isCheckoutPage = window.location.pathname.includes('checkout');
        this.bumpContainer = this.isCheckoutPage ? document.getElementById('checkout-bump-offer') : null;

        this.cart.forEach(item => this.deriveSlugFromItem(item));

        // Create cart content container if needed
        this.ensureCartContainer();
        
        // If on checkout page and cart is empty, redirect to home
        if (this.isCheckoutPage && this.cart.length === 0) {
            window.location.href = '/';
            return;
        }
        
        // Initial UI update to show existing cart items
        this.updateCartUI();
        
        if (this.isCheckoutPage) {
            this.updateCheckoutSummary();
        }
        
        // Set up event listeners
        this.initEventListeners();
    }
    
    ensureCartContainer() {
        const drawerMdlbx = document.querySelector('.drower-mdlbx');
        if (drawerMdlbx && !drawerMdlbx.querySelector('div')) {
            drawerMdlbx.innerHTML = '<div></div>';
        }
    }

    initEventListeners() {
        // Add to cart button handlers - product detail pages
        const addToCartButtons = document.querySelectorAll('.prod-det-s1-btn, #cart_btn2');
        if (addToCartButtons.length) {
            addToCartButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.addToCart();
                    this.openCart();
                });
            });
        }

        // Cart icon in header handler
        const cartBtn = document.querySelector('#cart_btn');
        if (cartBtn) {
            cartBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.openCart();
            });
        }

        // Close cart handlers
        document.querySelectorAll('.cart-close, .cart-overlay').forEach(element => {
            element.addEventListener('click', () => this.closeCart());
        });

        // Event delegation for cart actions (remove, adjust qty)
        const cartContainer = document.querySelector('.drower-mdlbx');
        if (cartContainer) {
            cartContainer.addEventListener('click', (e) => {
                if (e.target.closest('.cart-remv')) {
                    const row = e.target.closest('.drawer_row');
                    const index = Array.from(row.parentNode.children).indexOf(row);
                    this.removeFromCart(index);
                } else if (e.target.classList.contains('slide_add')) {
                    const row = e.target.closest('.drawer_row');
                    const index = Array.from(row.parentNode.children).indexOf(row);
                    this.updateQuantity(index, 1);
                } else if (e.target.classList.contains('slide_sub')) {
                    const row = e.target.closest('.drawer_row');
                    const index = Array.from(row.parentNode.children).indexOf(row);
                    this.updateQuantity(index, -1);
                }
            });
        }
        
        // Checkout page cart toggle (mobile)
        const summaryToggle = document.querySelector('.summry-toggle');
        if (summaryToggle) {
            summaryToggle.addEventListener('click', () => {
                const cartSummary = document.querySelector('#toggle-mob-cart');
                if (cartSummary) {
                    cartSummary.classList.toggle('isopened');
                    const smTxtElements = document.querySelectorAll('.sm-txt');
                    smTxtElements.forEach(el => {
                        el.style.display = el.style.display === 'none' ? 'inline' : 'none';
                    });
                }
            });
        }
    }

    addToCart() {
        const productContainer = document.querySelector('.prod-det-s1-rgt');
        
        // Return if not on a product page
        if (!productContainer) return;
        
        // Invalidate existing coupon if cart will change
        this.invalidateCoupon('cart_updated');

        // Determine if subscription or one-time purchase based on active selection
        const isSubscription = document.querySelector('.option_row.sub-opt.active') !== null;
        const offerType = isSubscription ? 'sub' : 'reg';
        
        // Get selected package from the correct container
        const packageContainer = isSubscription ? 
                                document.querySelector('.sub-pkg .package_row') : 
                                document.querySelector('.otp-pkg .package_row');
        
        if (!packageContainer) return;
        
        const selectedPackage = packageContainer.querySelector('.package_col.active');
        if (!selectedPackage) return;
        
        // Get product details
        const productName = document.querySelector('.prod-det-nm').textContent.trim();
        const productDesc = document.querySelector('.comn-prod-det-tx')?.textContent.trim() || '';
        const productImage = document.querySelector('.prd-sldr .slick-current img')?.src || 
                            document.querySelector('.prd-sldr .prd-sld')?.src;
                     
        // Get CRM product ID from data attributes (to be added to the HTML)
        const crmProductId = selectedPackage.dataset.crm_product_id || '';
        const priceLabel = selectedPackage.dataset.pricelabel ? selectedPackage.dataset.pricelabel.trim() : '/ea';

        const product = {
            name: productName,
            description: productDesc,
            image: productImage,
            packageType: selectedPackage.dataset.type || '',
            price: parseFloat(selectedPackage.dataset.price) || 0,
            savings: parseFloat(selectedPackage.dataset.savings) || 0,
            discount: parseFloat(selectedPackage.dataset.discount) || 0,
            fullPrice: parseFloat(selectedPackage.dataset.fullprice) || 0,
            quantity: 1,
            offer: selectedPackage.dataset.offer || (isSubscription ? 'subscription' : 'one-time'),
            qty: selectedPackage.querySelector('.pkg-qty')?.textContent || selectedPackage.dataset.qty || '',
            crm_product_id: crmProductId,
            priceLabel
        };

        const productSlug = this.getCurrentPageSlug();
        if (productSlug) {
            product.productSlug = productSlug;
        }
        if (!product.fullPrice) {
            product.fullPrice = product.price;
        }

        // Check if product already exists in cart (same product, package type and offer type)
        const existingProductIndex = this.cart.findIndex(item => 
            item.name === product.name && 
            item.packageType === product.packageType && 
            item.offer === product.offer
        );

        if (existingProductIndex !== -1) {
            // Increment quantity if product exists
            this.cart[existingProductIndex].quantity++;
            if (productSlug && !this.cart[existingProductIndex].productSlug) {
                this.cart[existingProductIndex].productSlug = productSlug;
            }
        } else {
            // Add new product to cart
            this.cart.push(product);
        }

        this.saveCart();
        this.updateCartUI();

        if (sessionStorage.getItem('is_facebook_traffic') === 'true') {
            gtag('event', 'add_to_cart', { 
                funnel: 'facebook - direct' 
            });

            console.log('added to cart');
        }

        // Update checkout summary if on checkout page
        if (this.isCheckoutPage) {
            this.updateCheckoutSummary();
        }
    }

    removeFromCart(index) {
        this.invalidateCoupon('cart_updated');
        this.cart.splice(index, 1);
        this.saveCart();
        this.updateCartUI();
        
        // Force additional check for empty cart
        if (this.cart.length === 0) {
            const cartCounters = document.querySelectorAll('.cart-count');
            if (cartCounters && cartCounters.length) {
                cartCounters.forEach(counter => {
                    counter.textContent = '0';
                    counter.style.display = 'none';
                });
            }
        }
        
        // Update checkout summary if on checkout page
        if (this.isCheckoutPage) {
            this.updateCheckoutSummary();
        }
    }

    updateQuantity(index, change) {
        this.invalidateCoupon('cart_updated');
        const newQty = this.cart[index].quantity + change;
        
        if (newQty <= 0) {
            this.removeFromCart(index);
            return;
        }
        
        this.cart[index].quantity = newQty;
        this.saveCart();
        this.updateCartUI();
        
        // Update checkout summary if on checkout page
        if (this.isCheckoutPage) {
            this.updateCheckoutSummary();
        }
    }

    calculateSubtotal(asNumber = false) {
        this.subtotal = this.cart.reduce((total, item) => {
            return total + (item.fullPrice * item.quantity);
        }, 0);
        return asNumber ? this.subtotal : this.subtotal.toFixed(2);
    }

    calculateSavingsPercentage(item) {
        if (!item.fullPrice || item.fullPrice <= 0) return 0;
        return Math.round(((item.fullPrice - item.price) / item.fullPrice) * 100);
    }

    generateCartFingerprint() {
        // Create a simple fingerprint of cart contents to detect changes
        const fingerprint = this.cart.map(item => ({
            id: item.crm_product_id,
            qty: item.quantity,
            price: item.fullPrice
        }));
        return JSON.stringify(fingerprint);
    }

    loadCouponFromStorage() {
        try {
            if (typeof sessionStorage === 'undefined') {
                return null;
            }

            const stored = sessionStorage.getItem(this.couponStorageKey);
            if (!stored) {
                return null;
            }

            const parsed = JSON.parse(stored);
            if (!parsed || !parsed.code) {
                return null;
            }

            parsed.discountAmount = parsed.discountAmount !== undefined ? parseFloat(parsed.discountAmount) : 0;
            parsed.newTotal = parsed.newTotal !== undefined && parsed.newTotal !== null ? parseFloat(parsed.newTotal) : null;

            if (Number.isNaN(parsed.discountAmount)) {
                parsed.discountAmount = 0;
            }

            if (parsed.newTotal !== null && Number.isNaN(parsed.newTotal)) {
                parsed.newTotal = null;
            }

            return parsed;
        } catch (error) {
            console.warn('Unable to load stored coupon state', error);
            return null;
        }
    }

    setCoupon(coupon) {
        if (!coupon || !coupon.code) {
            return;
        }

        const discountAmount = coupon.discountAmount !== undefined ? parseFloat(coupon.discountAmount) : 0;
        const newTotal = coupon.newTotal !== undefined && coupon.newTotal !== null ? parseFloat(coupon.newTotal) : null;

        this.appliedCoupon = {
            code: coupon.code,
            discountAmount: Number.isNaN(discountAmount) ? 0 : parseFloat(discountAmount.toFixed(2)),
            newTotal: newTotal !== null && !Number.isNaN(newTotal) ? parseFloat(Math.max(newTotal, 0).toFixed(2)) : null,
            raw: coupon.raw || {},
            cartFingerprint: this.generateCartFingerprint() // Store cart state when coupon is applied
        };

        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(this.couponStorageKey, JSON.stringify(this.appliedCoupon));
            }
        } catch (error) {
            console.warn('Unable to persist coupon state', error);
        }

        if (this.isCheckoutPage) {
            this.updateCheckoutSummary();
            document.dispatchEvent(new CustomEvent('checkout:couponApplied', {
                detail: { coupon: this.appliedCoupon }
            }));
        }
    }

    clearCoupon(options = {}) {
        const { skipUpdate = false, silent = false, reason = null } = options;

        if (!this.appliedCoupon) {
            return;
        }

        const previousCoupon = this.appliedCoupon;
        this.appliedCoupon = null;

        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.removeItem(this.couponStorageKey);
            }
        } catch (error) {
            console.warn('Unable to clear coupon state', error);
        }

        if (this.isCheckoutPage && !skipUpdate) {
            this.updateCheckoutSummary();
        }

        if (this.isCheckoutPage && !silent) {
            document.dispatchEvent(new CustomEvent('checkout:couponCleared', {
                detail: { reason, coupon: previousCoupon }
            }));
        }
    }

    invalidateCoupon(reason = 'cart_updated') {
        if (!this.appliedCoupon) {
            return;
        }

        this.clearCoupon({ reason });
    }

    checkAndClearStaleCartCoupon() {
        // Check if coupon exists and if cart has changed since it was applied
        if (!this.appliedCoupon || !this.appliedCoupon.code) {
            return false;
        }

        const currentFingerprint = this.generateCartFingerprint();
        const storedFingerprint = this.appliedCoupon.cartFingerprint;

        // If no fingerprint was stored (old coupon format) or if cart has changed
        if (!storedFingerprint || currentFingerprint !== storedFingerprint) {
            this.clearCoupon({ reason: 'cart_changed', silent: false });
            return true; // Cart changed, coupon was cleared
        }

        return false; // Cart unchanged, coupon still valid
    }

    updateCartUI() {
        this.ensureCartContainer();
        
        const cartContainer = document.querySelector('.drower-mdlbx > div');
        if (!cartContainer) return;
        
        // Get the cart footer
        const cartFooter = document.querySelector('.drower-btm');
    
        // Clear current cart items
        cartContainer.innerHTML = '';
        
        if (this.cart.length === 0) {
            // Show empty cart message
            cartContainer.innerHTML = '<div class="empty-cart-message">Your cart is empty</div>';
            
            // Update total to zero
            const totalElement = document.querySelector('.cart-prc-p2 span');
            if (totalElement) {
                totalElement.textContent = '$0.00';
            }
            
            // Hide the cart footer
            if (cartFooter) {
                cartFooter.style.display = 'none';
            }
            
            return;
        }
        
        // Show the cart footer if it exists
        if (cartFooter) {
            cartFooter.style.display = 'block';
        }
    
        // Add each product to cart
        this.cart.forEach(item => {
            const offerTypeDisplay = item.offer === 'subscription' ? 'Subscription' : 'One-time purchase';
            
            // Get standardized product image based on product name
            const productImage = this.getProductImage(item.name);
            
            const priceLabelText = item.priceLabel ? item.priceLabel : '/ea';
            const itemHTML = `
                <div class="drawer_row">
                    <div class="drawer-prod-lft">
                        <img src="${productImage}" class="drawer-prod" alt="${item.name}" width="488" height="580">
                        <a href="javascript:void(0)" class="cart-remv">
                            <svg width="10" height="10" viewBox="0 0 24 24" class="fkcart-icon-close" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M4.1518 4.31359L4.22676 4.22676C4.50161 3.9519 4.93172 3.92691 5.2348 4.1518L5.32163 4.22676L12 10.9048L18.6784 4.22676C18.9807 3.92441 19.4709 3.92441 19.7732 4.22676C20.0756 4.5291 20.0756 5.01929 19.7732 5.32163L13.0952 12L19.7732 18.6784C20.0481 18.9532 20.0731 19.3833 19.8482 19.6864L19.7732 19.7732C19.4984 20.0481 19.0683 20.0731 18.7652 19.8482L18.6784 19.7732L12 13.0952L5.32163 19.7732C5.01929 20.0756 4.5291 20.0756 4.22676 19.7732C3.92441 19.4709 3.92441 18.9807 4.22676 18.6784L10.9048 12L4.22676 5.32163C3.9519 5.04678 3.92691 4.61667 4.1518 4.31359L4.22676 4.22676L4.1518 4.31359Z" fill="currentColor"></path>
                            </svg>
                        </a>
                    </div>
                    <div class="drawer-prod-rght">
                        <h1 class="drwer-prod-name">${item.name}</h1>
                        <p class="drwer-txt2">${item.qty} - ${offerTypeDisplay}</p>
                        <div class="slide_cart-qty-div c-q-1">
                            <button type="button" class="slide_sub qtyBtn">-</button>
                            <input type="text" id="Quantity" name="quantity" value="${item.quantity}" min="1" class="slide_quantity-selector">
                            <button type="button" class="slide_add qtyBtn">+</button>
                        </div>
                    </div>
                    <div class="drawer_price">
                        <p class="drawer_prod-price">
                            <span class="">$${(item.fullPrice * item.quantity).toFixed(2)}</span> 
                            <br>
                            <strong>$${(item.price).toFixed(2)}${priceLabelText.startsWith('/') || priceLabelText.startsWith(' per') ? '' : ' '}${priceLabelText}</strong>
                        </p>
                        <p class="drawer_save">Save ${item.discount}%</p>
                    </div>
                </div>
            `;
            
            cartContainer.innerHTML += itemHTML;
        });
    
        // Update total
        const subtotal = this.calculateSubtotal();
        const totalElement = document.querySelector('.cart-prc-p2 span');
        if (totalElement) {
            totalElement.textContent = `$${subtotal}`;
        }
    
        // Update cart counter (if exists)
        const cartCount = this.cart.reduce((count, item) => count + item.quantity, 0);
        const cartCounters = document.querySelectorAll('.cart-count');
        if (cartCounters && cartCounters.length) {
            cartCounters.forEach(counter => {
                counter.textContent = cartCount;
                counter.style.display = cartCount > 0 ? 'block' : 'none';
            });
        }
    }    

    updateCheckoutSummary() {
        if (!this.isCheckoutPage) return;

        const checkoutCartContainer = document.querySelector('#toggle-mob-cart > div');
        if (!checkoutCartContainer) return;

        const togglePrice = document.querySelector('.togle-price');
        const subtotalElement = document.querySelector('.cart-table.bdr td[align="right"] span');
        const totalElement = document.querySelector('.total-txt span strong');

        checkoutCartContainer.innerHTML = '';

        if (this.cart.length === 0) {
            if (togglePrice) togglePrice.textContent = '$0.00';
            if (subtotalElement) subtotalElement.textContent = '$0.00';
            if (totalElement) totalElement.textContent = '$0.00';
            checkoutCartContainer.innerHTML = '<p class="empty-cart-message">Your cart is empty</p>';
            this.renderBumpOffer(null);
            this.attachBumpRemoveListeners();
            return;
        }

        const subtotalValue = this.calculateSubtotal(true);
        let totalValue = subtotalValue;
        let discountAmount = 0;
        const couponCode = this.appliedCoupon?.code || '';

        if (this.appliedCoupon) {
            const parsedDiscount = parseFloat(this.appliedCoupon.discountAmount ?? 0);
            if (!Number.isNaN(parsedDiscount)) {
                discountAmount = parsedDiscount;
            }

            const parsedTotal = this.appliedCoupon.newTotal !== null && this.appliedCoupon.newTotal !== undefined
                ? parseFloat(this.appliedCoupon.newTotal)
                : null;

            if (parsedTotal !== null && !Number.isNaN(parsedTotal)) {
                totalValue = parsedTotal;
            } else {
                totalValue = subtotalValue - discountAmount;
            }
        }

        totalValue = Math.max(totalValue, 0);

        const subtotal = subtotalValue.toFixed(2);
        const total = totalValue.toFixed(2);
        const discountText = discountAmount > 0 ? discountAmount.toFixed(2) : null;

        if (togglePrice) {
            togglePrice.textContent = `$${total}`;
        }

        if (subtotalElement) {
            subtotalElement.textContent = `$${subtotal}`;
        }

        if (totalElement) {
            totalElement.textContent = `$${total}`;
        }

        const bumpOfferDetails = this.determineBumpOffer();

        this.cart.forEach(item => {
            this.deriveSlugFromItem(item);
            const itemPrice = parseFloat(item.fullPrice ?? item.price ?? 0) || 0;
            const itemQuantity = item.quantity ?? 1;
            const itemTotal = (itemPrice * itemQuantity).toFixed(2);
            const isSubscription = item.offer === 'subscription';
            const offerTypeDisplay = item.isBump ? 'Special add-on' : (isSubscription ? 'Subscription' : 'One-time purchase');
            const metaParts = [];
            if (item.qty) {
                metaParts.push(item.qty);
            }
            metaParts.push(offerTypeDisplay);
            const metaLabel = metaParts.join(' • ');
            const bumpBadge = item.isBump ? '<span class="bump-chip">Add-On</span>' : '';
            const removeBtn = item.isBump ? `<button type="button" class="bump-remove-btn" data-bump-id="${item.bumpId || ''}">Remove</button>` : '';
            const productImage = this.getProductImage(item.name);

            checkoutCartContainer.innerHTML += `
                <div class="prod-box">
                    <div class="ord-lft">
                        <div class="prod-img">
                            <img src="${productImage}" alt="${item.name}" width="488" height="580">
                        </div>
                        <div class="prod-count">${itemQuantity}</div>
                        <p class="ord-title">${bumpBadge}<span>${item.name}</span><br>${metaLabel}</p>
                    </div>
                    <div class="ord-right">
                        <p>$${itemTotal}</p>
                        ${removeBtn}
                    </div>
                </div>
            `;
        });

        const discountSection = discountText ? `
            <table class="cart-table" cellpadding="0" cellspacing="0" border="0">
                <tr>
                    <td align="left"><span>Discount${couponCode ? ` (${couponCode.toUpperCase()})` : ''}</span></td>
                    <td align="right"><span style="color:#40ac22;">-$${discountText}</span></td>
                </tr>
            </table>
            <div class="devider-cp"></div>
        ` : '';

        checkoutCartContainer.innerHTML += `
            <div class="devider-cp"></div>
            <table class="cart-table bdr" cellpadding="0" cellspacing="0" border="0">
                <tr>
                    <td align="left"><span>Sub Total</span></td>
                    <td align="right"><span>$${subtotal}</span></td>
                </tr>
            </table>
            <div class="devider-cp"></div>

            ${discountSection}

            <table class="cart-table" cellpadding="0" cellspacing="0" border="0">
                <tr>
                    <td align="left"><span>Shipping</span></td>
                    <td align="right"><span style="color:#40ac22;">Free Shipping</span></td>
                </tr>
            </table>
            <div class="devider-cp"></div>
            <table class="cart-table bdr" cellpadding="0" cellspacing="0">
                <tr>
                    <td align="left" class="total-txt"><span><strong>Total</strong></span></td>
                    <td align="right" class="total-txt"><span><strong>$${total}</strong></span></td>
                </tr>
            </table>
        `;

        this.renderBumpOffer(bumpOfferDetails);
        this.attachBumpRemoveListeners();
    }


    openCart() {
        // Make sure we have the latest cart data displayed
        this.updateCartUI();
        
        document.querySelector('.cart-is').classList.add('cart_open');
        document.querySelector('.cart-overlay').style.display = 'block';
    }

    closeCart() {
        document.querySelector('.cart-is').classList.remove('cart_open');
        document.querySelector('.cart-overlay').style.display = 'none';
    }

    saveCart() {
        localStorage.setItem('luminaraCart', JSON.stringify(this.cart));
    }

    getCurrentPageSlug() {
        if (typeof window === 'undefined') return '';
        const path = window.location.pathname || '';
        const segments = path.replace(/^\//, '').split('/');
        return segments[0] || '';
    }

    deriveSlugFromItem(item) {
        if (!item) return '';
        if (item.productSlug) return item.productSlug;

        const id = String(item.crm_product_id ?? '').trim();
        const slugMap = {
            rewind: new Set(['1','2','16','17','35','36']),
            renew: new Set(['10','11','12','25','26','27']),
            restore: new Set(['7','8','9','22','23','24'])
        };

        for (const [slug, ids] of Object.entries(slugMap)) {
            if (ids.has(id)) {
                item.productSlug = slug;
                return slug;
            }
        }

        const name = (item.name || '').toLowerCase();
        if (name.includes('rewind')) {
            item.productSlug = 'rewind';
            return 'rewind';
        }
        if (name.includes('renew')) {
            item.productSlug = 'renew';
            return 'renew';
        }
        if (name.includes('restore') || name.includes('collagen')) {
            item.productSlug = 'restore';
            return 'restore';
        }

        return item.productSlug || '';
    }

    isProductMatch(item, slug) {
        return this.deriveSlugFromItem(item) === slug;
    }

    determineBumpOffer() {
        if (!this.isCheckoutPage) return null;
        const hasRewind = this.cart.some(item => this.isProductMatch(item, 'rewind'));
        if (!hasRewind) return null;

        const renewBump = this.cart.find(item => item.isBump && item.bumpId === 'renew-bump');
        const collagenBump = this.cart.find(item => item.isBump && item.bumpId === 'collagen-bump');
        const hasRenew = this.cart.some(item => this.isProductMatch(item, 'renew'));
        const hasCollagen = this.cart.some(item => this.isProductMatch(item, 'restore'));

        if (!hasRenew) {
            const offer = this.buildRenewBump(Boolean(renewBump));
            return offer && offer.isAdded ? null : offer;
        }

        if (!hasCollagen) {
            const offer = this.buildCollagenBump(Boolean(collagenBump));
            return offer && offer.isAdded ? null : offer;
        }

        return null;
    }

    buildRenewBump(isAdded) {
        return {
            id: 'renew-bump',
            slug: 'renew',
            productName: 'Renew',
            displayName: 'Renew Chest & Arm Complex',
            price: 19,
            compareAt: 50,
            crmProductId: '10',
            image: 'images/renew-btl.png',
            qty: '1 Bottle',
            finePrint: 'Ships with your order. No fees. Cancel anytime.',
            buttonTextAdd: 'Yes, add Renew',
            buttonTextRemove: 'Remove from order',
            headline: isAdded ? 'Renew add-on added to your order' : 'Add Renew for just $19',
            description: 'Tighten, soothe, and hydrate with an extra bottle of Renew for 60% off the regular price.',
            highlight: 'Normally $50 — today only $19 when you bundle with Rewind.',
            buttonColor: '#047857',
            buttonHover: '#065f46',
            borderColor: '#6ee7b7',
            gradient: 'linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%)',
            shadowColor: 'rgba(4,120,87,0.18)',
            themeClass: '',
            pillText: isAdded ? 'In Your Order' : 'Special Add-On',
            isAdded
        };
    }

    buildCollagenBump(isAdded) {
        return {
            id: 'collagen-bump',
            slug: 'restore',
            productName: 'Restore Collagen Peptide',
            displayName: 'Restore Collagen Peptide',
            price: 39,
            compareAt: 59,
            crmProductId: '7',
            image: 'images/restore-btl.png',
            qty: '1 Bottle',
            finePrint: 'Ships with your order. No fees. Cancel anytime.',
            buttonTextAdd: 'Yes, add Collagen',
            buttonTextRemove: 'Remove from order',
            headline: isAdded ? 'Collagen Peptide added to your order' : 'Nourish your skin from within',
            description: 'Support firm, glowing skin with Restore Collagen Peptide for just $39.',
            highlight: 'Normally $59 — save $20 when you pair it with your Rewind routine.',
            buttonColor: '#4338ca',
            buttonHover: '#3730a3',
            borderColor: '#c4b5fd',
            gradient: 'linear-gradient(135deg, #eef2ff 0%, #ffffff 100%)',
            shadowColor: 'rgba(79,70,229,0.16)',
            themeClass: 'bump-card--collagen',
            pillText: isAdded ? 'In Your Order' : 'Best Seller Add-On',
            isAdded
        };
    }

    renderBumpOffer(offer) {
        if (!this.isCheckoutPage) return;
        if (!this.bumpContainer) {
            this.bumpContainer = document.getElementById('checkout-bump-offer');
        }
        if (!this.bumpContainer) return;

        if (!offer) {
            this.bumpContainer.style.display = 'none';
            this.bumpContainer.innerHTML = '';
            return;
        }

        const priceDisplay = this.formatPrice(offer.price);
        const compareDisplay = offer.compareAt ? this.formatPrice(offer.compareAt) : null;
        const classes = ['bump-card'];
        if (offer.themeClass) classes.push(offer.themeClass);
        if (offer.isAdded) classes.push('bump-card--added');

        const styleAttr = `--bump-color:${offer.buttonColor};--bump-color-dark:${offer.buttonHover};--bump-border:${offer.borderColor};--bump-shadow:${offer.shadowColor};--bump-gradient:${offer.gradient};`;

        this.bumpContainer.style.display = 'block';
        this.bumpContainer.innerHTML = `
            <div class="${classes.join(' ')}" style="${styleAttr}">
                <div class="bump-card__header">
                    <span class="bump-card__pill">${offer.pillText}</span>
                    <span class="bump-card__price">$${priceDisplay}</span>
                </div>
                <div class="bump-card__body">
                    <div class="bump-card__image">
                        <img src="${offer.image}" alt="${offer.productName}">
                    </div>
                    <div class="bump-card__content">
                        <div class="bump-card__text">
                            <h4>${offer.headline}</h4>
                            ${compareDisplay ? `<span class="bump-card__compare bump-card__compare--inline">Normally $${compareDisplay}</span>` : ''}
                            <p>${offer.description}</p>
                            ${offer.highlight ? `<p class="bump-card__highlight">${offer.highlight}</p>` : ''}
                        </div>
                        <div class="bump-card__cta">
                            <button type="button" class="bump-card__btn ${offer.isAdded ? 'is-added' : ''}" data-bump-id="${offer.id}">
                                ${offer.isAdded ? offer.buttonTextRemove : offer.buttonTextAdd}
                            </button>
                            <span class="bump-card__fine">${offer.finePrint}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const actionBtn = this.bumpContainer.querySelector('.bump-card__btn');
        if (actionBtn) {
            actionBtn.addEventListener('click', () => {
                this.toggleBumpOffer(offer);
            });
        }
    }

    toggleBumpOffer(offer) {
        if (!offer) return;
        if (offer.isAdded) {
            this.removeBumpOffer(offer.id);
        } else {
            this.addBumpToCart(offer);
        }
    }

    addBumpToCart(offer) {
        if (!offer) return;
        if (this.cart.some(item => item.isBump && item.bumpId === offer.id)) {
            return;
        }

        this.invalidateCoupon('cart_updated');

        const newItem = {
            name: offer.displayName || offer.productName,
            description: offer.description,
            image: offer.image,
            packageType: 'bump',
            price: Number(offer.price) || 0,
            savings: 0,
            discount: 0,
            fullPrice: Number(offer.price) || 0,
            quantity: 1,
            offer: 'one-time',
            qty: offer.qty || '1 Bottle',
            crm_product_id: offer.crmProductId || '',
            priceLabel: '/ each',
            isBump: true,
            bumpId: offer.id,
            bumpLabel: offer.pillText,
            productSlug: offer.slug
        };

        this.cart.push(newItem);
        this.saveCart();
        this.updateCartUI();

        if (this.isCheckoutPage) {
            this.updateCheckoutSummary();
        }
    }

    removeBumpOffer(bumpId) {
        const index = this.cart.findIndex(item => item.isBump && item.bumpId === bumpId);
        if (index === -1) return;

        this.invalidateCoupon('cart_updated');
        this.cart.splice(index, 1);
        this.saveCart();
        this.updateCartUI();

        if (this.isCheckoutPage) {
            this.updateCheckoutSummary();
        }
    }

    attachBumpRemoveListeners() {
        if (!this.isCheckoutPage) return;

        document.querySelectorAll('.bump-remove-btn').forEach(button => {
            if (button.dataset.bound === 'true') return;
            button.dataset.bound = 'true';
            button.addEventListener('click', (event) => {
                event.preventDefault();
                const bumpId = button.dataset.bumpId;
                if (bumpId) {
                    this.removeBumpOffer(bumpId);
                }
            });
        });
    }

    formatPrice(value) {
        const number = Number(value || 0);
        if (!Number.isFinite(number)) {
            return '0';
        }
        const fixed = number % 1 === 0 ? number.toFixed(0) : number.toFixed(2);
        return fixed.replace(/\.00$/, '');
    }

    getProductImage(productName) {
        const name = productName.toLowerCase().trim();
        
        if (name.includes('seasonal')) {
            return 'images/bundle.png';
        } else if (name.includes('rewind')) {
            return 'images/rewind-btl.png';
        } else if (name.includes('revive')) {
            return 'images/revive-btl.png';
        } else if (name.includes('restore')) {
            return 'images/restore-btl.png';
        } else if (name.includes('renew')) {
            return 'images/renew-btl.png';
        } else if (name.includes('remove')) {
            return 'images/remove-btl.png';
        }
        
        // Default image if no match is found
        return 'images/rewind-btl.png';
    }
}

// Initialize cart handler when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.luminaraCart = new CartHandler();
});
